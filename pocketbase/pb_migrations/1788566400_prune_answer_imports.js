/// <reference path="../pb_data/types.d.ts" />

// ReduxShare storage slimming: per-question content hashes replace the
// per-answer dedup collection.
//
// Before: every imported answer created one row in
// `reduxshare_review_answer_imports` (user × domain × attempt × question ×
// hash × slot × answer) — unbounded growth, one REST call per answer.
// After: one `review_imports` row per attempt carries
// `imported_question_hashes` ({ "<questionId>\n<questionHash>": "<fnv1a>" }).
// Identical re-imports are skipped per question; a changed question (e.g.
// after a regrade) gets a new hash and is counted again.
//
// NOTE: dropping the collection destroys old per-answer dedup rows. Attempts
// revisited after this migration are treated as new and counted once more
// (bounded one-time effect). The `users` profile fields and all
// created/updated timestamps are untouched.

migrate(
  (app) => {
    const reviewImports = app.findCollectionByNameOrId("reduxshare_review_imports");

    reviewImports.fields.addMarshaledJSON(
      JSON.stringify({
        hidden: false,
        id: "json_rs_ri_hashes",
        maxSize: 2000000,
        name: "imported_question_hashes",
        presentable: false,
        required: false,
        system: false,
        type: "json"
      })
    );
    app.save(reviewImports);

    app.delete(app.findCollectionByNameOrId("reduxshare_review_answer_imports"));
  },
  (app) => {
    // Rollback restores the collection SCHEMA only — imported rows deleted by
    // the forward migration cannot be recovered.
    const users = app.findCollectionByNameOrId("users");
    const reviewAnswerImports = new Collection({
      createRule: "@request.auth.id != ''",
      deleteRule: null,
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          hidden: false,
          id: "text_rs_rai_id",
          max: 15,
          min: 15,
          name: "id",
          pattern: "^[a-zA-Z0-9]+$",
          presentable: false,
          primaryKey: true,
          required: true,
          system: true,
          type: "text"
        },
        {
          cascadeDelete: true,
          collectionId: users.id,
          hidden: false,
          id: "rel_rs_rai_user",
          maxSelect: 1,
          minSelect: 0,
          name: "user",
          presentable: false,
          required: true,
          system: false,
          type: "relation"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_domain",
          max: 0,
          min: 0,
          name: "moodle_domain",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_attempt",
          max: 0,
          min: 0,
          name: "attempt_key",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_qid",
          max: 0,
          min: 0,
          name: "question_id",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_qhash",
          max: 0,
          min: 0,
          name: "question_hash",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_slotkey",
          max: 0,
          min: 0,
          name: "slot_key",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          autogeneratePattern: "",
          hidden: false,
          id: "text_rs_rai_akey",
          max: 0,
          min: 0,
          name: "answer_key",
          pattern: "",
          presentable: false,
          primaryKey: false,
          required: true,
          system: false,
          type: "text"
        },
        {
          hidden: false,
          id: "autodate_rs_rai_created",
          name: "created",
          onCreate: true,
          onUpdate: false,
          presentable: false,
          system: false,
          type: "autodate"
        },
        {
          hidden: false,
          id: "autodate_rs_rai_updated",
          name: "updated",
          onCreate: true,
          onUpdate: true,
          presentable: false,
          system: false,
          type: "autodate"
        }
      ],
      id: "pbc_rs_review_answer_imports",
      indexes: [
        'CREATE UNIQUE INDEX "idx_reduxshare_review_answer_imports_identity" ON "reduxshare_review_answer_imports" ("user", "moodle_domain", "attempt_key", "question_id", "question_hash", "slot_key", "answer_key")'
      ],
      listRule: "@request.auth.id != ''",
      name: "reduxshare_review_answer_imports",
      system: false,
      type: "base",
      updateRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''"
    });
    app.save(reviewAnswerImports);
  }
);
