/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "select_rs_users_plan",
        maxSelect: 1,
        name: "plan",
        presentable: false,
        required: false,
        system: true,
        type: "select",
        values: ["free", "low", "medium", "high"],
      }),
    );
    app.save(users);

    app.db().newQuery("UPDATE users SET plan = 'free' WHERE plan IS NULL OR plan = ''").execute();
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const planField = users.fields.getByName("plan");
    if (planField) {
      users.fields.remove(planField);
      app.save(users);
    }
  },
);
