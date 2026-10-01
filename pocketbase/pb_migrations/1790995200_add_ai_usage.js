/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const aiUsage = new Collection({
      createRule: null,
      deleteRule: null,
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          hidden: false,
          id: "text_rs_aiusage_id",
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
          id: "rel_rs_aiusage_user",
          maxSelect: 1,
          minSelect: 0,
          name: "user",
          presentable: false,
          required: true,
          system: false,
          type: "relation",
        },
        {
          hidden: false,
          id: "select_rs_aiusage_period",
          maxSelect: 1,
          name: "period",
          presentable: false,
          required: true,
          system: false,
          type: "select",
          values: ["minute", "day"],
        },
        {
          hidden: false,
          id: "date_rs_aiusage_start",
          max: "",
          min: "",
          name: "period_start",
          presentable: false,
          required: true,
          system: false,
          type: "date",
        },
        {
          hidden: false,
          id: "number_rs_aiusage_count",
          max: null,
          min: null,
          name: "count",
          onlyInt: true,
          presentable: false,
          required: true,
          system: false,
          type: "number",
        },
        {
          hidden: false,
          id: "autodate_rs_aiusage_created",
          name: "created",
          onCreate: true,
          onUpdate: false,
          presentable: false,
          system: false,
          type: "autodate",
        },
        {
          hidden: false,
          id: "autodate_rs_aiusage_updated",
          name: "updated",
          onCreate: true,
          onUpdate: true,
          presentable: false,
          system: false,
          type: "autodate",
        },
      ],
      id: "pbc_rs_aiusage",
      indexes: [
        'CREATE UNIQUE INDEX "idx_reduxshare_ai_usage_identity" ON "reduxshare_ai_usage" ("user", "period", "period_start")',
      ],
      listRule: null,
      name: "reduxshare_ai_usage",
      system: false,
      type: "base",
      updateRule: null,
      viewRule: null,
    });
    app.save(aiUsage);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("reduxshare_ai_usage"));
  },
);
