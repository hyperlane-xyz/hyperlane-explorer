---
name: resolve-pr-reviews
description: Review and resolve PR review comments interactively. Fetches unresolved comments, proposes fixes or explains why to skip, and replies on GitHub.
---

# Resolve PR Reviews

Use this skill to process review comments on a PR. Pass the PR number as an argument (e.g. `/resolve-pr-reviews 323`).

The repo is `hyperlane-xyz/hyperlane-explorer`.

## Workflow

### Step 1: Fetch unresolved review comments

Use the GitHub API to get all review comments:

```bash
# Inline review comments (line-anchored — CodeRabbit inline suggestions land here)
gh api repos/hyperlane-xyz/hyperlane-explorer/pulls/{pr}/comments

# PR-level reviews (claude[bot] consolidated review, paulbalaji approval)
gh api repos/hyperlane-xyz/hyperlane-explorer/pulls/{pr}/reviews

# Issue-level comments (general PR comments, CodeRabbit walkthrough/out-of-diff findings)
gh api repos/hyperlane-xyz/hyperlane-explorer/issues/{pr}/comments
```

CodeRabbit reviews are interesting: out-of-diff findings appear in `pulls/{pr}/reviews` body, not as inline comments. Always fetch both.

Filter out:
- Deployment/CI bots (Vercel deploy previews, CI status checks)
- Already-resolved threads
- Your own previous replies

Keep:
- AI review comments (claude[bot], CodeRabbit inline + walkthrough findings) — actionable
- Human reviewer comments

### Step 2: Analyze each comment

For each unresolved comment:
1. Read the relevant code being commented on
2. Understand the reviewer's concern
3. Propose a concrete fix OR explain why it should be skipped
4. Categorize severity: **must fix**, **good idea**, or **skip** (with reasoning)

### Step 3: Present to user

**IMPORTANT: Ask the user this question BEFORE showing any analysis.**

Use the `AskUserQuestion` tool to present a selection prompt:

```
Question: "Found N review comments on PR #XXXX. How would you like to go through them?"
Options:
  - "One by one" — Present each comment individually, user decides fix/skip before next
  - "All at once" — Present all comments together, user reviews full list
```

Wait for the user's selection before proceeding.

- **"one by one"** (default): Present each comment individually with your analysis. Wait for user to decide "fix" or "skip" before moving on.
- **"all at once"**: Present all comments together. User reviews the full list, then says which to fix.

For each comment, show:
- The reviewer's comment (abbreviated)
- **Your own independent analysis** — don't just parrot the reviewer. Verify if the concern is valid, check the relevant code/dependencies, and explain what's really happening. If the reviewer is wrong or partially wrong, say so.
- Your proposed fix (code diff) or skip reasoning
- Your recommendation

### Step 4: Apply fixes

Apply all approved fixes to the codebase.

### Step 5: Commit and push

Run the `/commit` skill to format, lint, typecheck, test, stage, and commit. Then push:

```bash
git push
```

### Step 6: Reply to comments on GitHub

Reply to each comment using the correct GitHub API endpoints:

**For inline review comments** (line-anchored):
```bash
gh api repos/hyperlane-xyz/hyperlane-explorer/pulls/{pr}/comments/{comment_id}/replies \
  --method POST \
  -f body="<reply text>"
```

**For issue-level comments** (general PR comments):
```bash
gh api repos/hyperlane-xyz/hyperlane-explorer/issues/{pr}/comments \
  --method POST \
  -f body="<reply text>"
```

**For PR-level review comments** (claude[bot] / CodeRabbit walkthrough): post a top-level issue comment referencing the review, or reply directly to the review comment thread if it has one.

Reply content:
- If fixed: "Fixed in <commit_sha>." (keep it short)
- If skipped: Brief explanation of why (1-2 sentences)
- Tag the reviewer with `@username` when replying to top-level comments

## Important Notes

- **Never guess comment IDs** — always fetch them from the API first
- **Test the reply endpoint** — `pulls/{pr}/comments/{id}/replies` is for inline review comment threads. `issues/{pr}/comments` is for general PR comments.
- **Don't reply to deploy/CI bots** — skip Vercel deploy previews, CI status comments. DO reply to AI review bots (claude[bot], CodeRabbit inline suggestions).
- **Keep replies concise** — reviewers don't want essays
- **CodeRabbit out-of-diff findings** live in the review body, not as inline comments — those are best replied to via a top-level issue comment
