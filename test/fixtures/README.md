# Moodle Question Fixtures

Each question type directory uses the same three filenames:

- `review-open.html` - Moodle review block where correct answers are visible.
- `review-hidden.html` - Moodle review block where correct answers are hidden, but the user's saved response is visible.
- `attempt.html` - Moodle attempt block used for menu, click, auto-fill, and AI behavior tests.

Replace placeholder files that contain `REDUXSHARE_FIXTURE_PLACEHOLDER` with the full Moodle `div.que` block. The matrix test treats placeholders as `todo`, so adding a real fixture automatically turns that row into an active test.
