/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const tasks = app.findCollectionByNameOrId("reduxshare_tasks");

    tasks.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "number_rs_tasks_vu",
        max: null,
        min: null,
        name: "votes_up",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    tasks.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "number_rs_tasks_vd",
        max: null,
        min: null,
        name: "votes_down",
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: "number",
      }),
    );
    app.save(tasks);

    const users = app.findCollectionByNameOrId("users");
    const taskVotes = new Collection({
      createRule: "@request.auth.id != '' && @request.auth.id = user",
      deleteRule: "@request.auth.id = user",
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          hidden: false,
          id: "text_rs_votes_id",
          max: 15,
          min: 15,
          name: "id",
          pattern: "^[a-zA-Z0-9]+$",
          presentable: false,
          primaryKey: true,
          required: true,
          system: true,
          type: "text",
        },
        {
          cascadeDelete: true,
          collectionId: users.id,
          hidden: false,
          id: "rel_rs_votes_user",
          maxSelect: 1,
          minSelect: 0,
          name: "user",
          presentable: false,
          required: true,
          system: false,
          type: "relation",
        },
        {
          cascadeDelete: true,
          collectionId: tasks.id,
          hidden: false,
          id: "rel_rs_votes_task",
          maxSelect: 1,
          minSelect: 0,
          name: "task",
          presentable: false,
          required: true,
          system: false,
          type: "relation",
        },
        {
          hidden: false,
          id: "number_rs_votes_value",
          max: null,
          min: null,
          name: "value",
          onlyInt: true,
          presentable: false,
          required: true,
          system: false,
          type: "number",
        },
        {
          hidden: false,
          id: "autodate_rs_votes_created",
          name: "created",
          onCreate: true,
          onUpdate: false,
          presentable: false,
          system: false,
          type: "autodate",
        },
        {
          hidden: false,
          id: "autodate_rs_votes_updated",
          name: "updated",
          onCreate: true,
          onUpdate: true,
          presentable: false,
          system: false,
          type: "autodate",
        },
      ],
      id: "pbc_rs_votes",
      indexes: [
        'CREATE UNIQUE INDEX "idx_reduxshare_task_votes_identity" ON "reduxshare_task_votes" ("user", "task")',
      ],
      listRule: "@request.auth.id != ''",
      name: "reduxshare_task_votes",
      system: false,
      type: "base",
      updateRule: "@request.auth.id != '' && @request.auth.id = user",
      viewRule: "@request.auth.id != ''",
    });
    app.save(taskVotes);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("reduxshare_task_votes"));

    const tasks = app.findCollectionByNameOrId("reduxshare_tasks");
    tasks.fields.removeByName("votes_up");
    tasks.fields.removeByName("votes_down");
    app.save(tasks);
  },
);
