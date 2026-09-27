/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "number_rs_users_iq",
        max: null,
        min: null,
        name: "imported_questions_count",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    users.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "number_rs_users_ac",
        max: null,
        min: null,
        name: "attempt_correct_count",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    users.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "number_rs_users_aw",
        max: null,
        min: null,
        name: "attempt_incorrect_count",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("imported_questions_count");
    users.fields.removeByName("attempt_correct_count");
    users.fields.removeByName("attempt_incorrect_count");
    app.save(users);
  },
);
