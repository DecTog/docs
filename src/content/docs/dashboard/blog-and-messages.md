---
title: Blog, messages and plans
description: The owner-only Blog, Categories, Messages and Plans screens, the limits of the public contact form, where the public blog is served, and which accounts are over their plan's limit.
sidebar:
  order: 8
---

**Blog**, **Messages** and **Plans** are the site operator's screens: they manage the public blog at https://dectog.com/blog and the inbox of the public contact form, and show every account's plan usage. They appear in the sidebar only for the account with the `owner` role. Other accounts that open `/dashboard/blog`, `/dashboard/messages` or `/dashboard/plans` are redirected to the Overview, and the API answers `403 Owner access required`. Who the owner is, and why signup never creates one, is explained in [Account and sign-in](/dashboard/account-and-sign-in/).

Unlike every other screen, these are not scoped to an account: there is one blog and one inbox per deployment, and Plans covers every account.

## Blog posts

`/dashboard/blog`, titled **Blog posts** ("Create and manage your blog content here."). The screen loads up to 200 posts, drafts included, and searches, sorts and pages them in the browser.

| Element | Behavior |
|---|---|
| **New post** | Opens the post editor. |
| **Categories** | Goes to `/dashboard/blog/categories`. |
| **Search** | Filters by title or category name. |
| Table | Checkbox · **Title** (with the slug underneath) · **Category** · **Created** · **Last edited** · **Status** (**Published** or **Draft**). Clicking **Category**, **Created** or **Last edited** sorts by that column; the default is Last edited, newest first. Clicking a row opens it in the editor. |
| Selection | The header checkbox selects the current page. With a selection, the toolbar reads `{n} selected` with **Delete** and **Cancel**. **Delete** asks "Delete {n} posts? This cannot be undone." first. |
| Pagination | 10 posts per page, with numbered pages and **Previous** / **Next**. |

Empty states: "No blog posts yet" with a **Create your first post** button, and "No posts match your search".

### The post editor

A side panel. The top bar has a close button, a **Publish now** switch, a **⋯** menu with **Save as draft** and, for an existing post, **Delete**, and the main button, which reads **Publish** when the switch is on and **Save** otherwise.

| Field | What to enter | Rules |
|---|---|---|
| **Title** (required) | Placeholder `Post title...`. Typing a title fills the slug while the slug is still empty. | 1 to 200 characters. |
| **Slug** (required) | Placeholder `post-url-slug`; a preview shows `/blog/{slug}`. | Lowercase letters and digits in groups separated by single `-` or `_`. The server accepts letters, digits, `-` and `_` up to 128 characters and refuses a slug another post uses: `A post with this slug already exists`. |
| **Category** | A **Select category** dropdown; the chosen category shows as a chip with an **X** to clear it. | Required to publish: the text "Category is required for publishing" appears when the switch is on and no category is chosen. Drafts need none. |
| **Image** | A URL (placeholder `https://example.com/cover.jpg`) with a thumbnail and a remove button. There is no upload. | http(s): `Featured image must be a valid http(s) URL`. Posts without an image get a stock cover on the public blog. |
| **Summary** | Placeholder `Brief description of the post...`. Hint: "This appears on blog listing pages and in search results". | Up to 500 characters. |
| **Content** | A rich-text editor with Undo, Redo, Bold, Italic, Strikethrough, Inline code, Heading 1 to 3, Bullet list, Numbered list, Quote, Code block, Divider, **Insert image URL** and **Add link**. Image URLs must start with `http://` or `https://`. Links must start with `https://`, `http://`, `mailto:`, `tel:`, `/` or `#`. | Required: `Content is required`. |

Saving creates or updates the post. The first publish stamps the publication date; unpublishing later keeps it. On success the panel closes and the list reloads. The editor checks the title, slug, summary and category before sending; when a check fails or the server rejects the save, the panel stays open and a toast in the top-right corner names the problem.

**Delete** in the **⋯** menu asks **Delete post**: "Are you sure you want to delete this post? This action cannot be undone."

## Categories

`/dashboard/blog/categories`, titled **Categories** ("Organize your blog content."). **New category** opens the editor; **Search** filters by name or slug; the table shows a checkbox, **Name** with the slug underneath, and **Created**, 10 per page. Bulk **Delete** on a selection asks "Delete {n} categories? This cannot be undone." first. Empty states: "No categories yet" and "No categories match your search".

| Field | Rules |
|---|---|
| **Name** (required) | 1 to 80 characters. While creating, typing a name fills the slug. |
| **Slug** | Hint: "Used in blog URLs and filters". Letters, digits, `-` and `_`; generated from the name when left empty; must be unique: `A category with this slug already exists`. |

**Delete** in the editor's **⋯** menu asks **Delete category**: "Are you sure you want to delete this category? Posts using this category will be unaffected but will no longer have a category assigned." The public blog lists only categories that have at least one published post.

## Messages

`/dashboard/messages`, titled **Messages** ("Messages sent through the contact form."). The screen loads the newest 200 messages. Each card shows the subject, the time it arrived in your local time, a trash icon, `{name} · {email}` with the email as a `mailto:` link, and the message text. There is no search, no pagination and no read or unread state.

The trash icon asks **Delete message**: "Are you sure you want to delete this message? This action cannot be undone." Empty state: "No messages yet." If the list cannot be loaded: "Could not load messages."

### The public contact form

Messages come from https://dectog.com/contact ("Get in Touch"). The form is checked in the browser and again by the server:

| Field | Rules |
|---|---|
| **Name** | 1 to 100 characters. |
| **Email** | A valid address, up to 200 characters. |
| **Subject** | 1 to 150 characters. |
| **Message** | 10 to 2,000 characters. |

The server accepts at most 5 submissions per hour per IP address. Submissions are counted before validation, so rejected ones use up the allowance; the sixth gets `Too many messages — try again later`. A message is only stored; no email is sent to anyone. The sender sees "Message sent!" with "Thank you for contacting us. We'll get back to you soon.", or "Message not sent" with the error.

## Plans

Every account's plan and [monthly active users](/dashboard/settings/#plan), for hosted DecTog's paid plans. The daily job at 03:17 UTC counts every account, including ones that never open Settings. Each account shows its username, its plan, its email (select it to write to them), its count against the plan's limit with a bar, and the last day counted; **Not counted yet** means the daily job has not run since it signed up. Accounts at or over their limit come first, marked **Over the limit**, then the rest by how close they are; the line above the list says how many are over.

Nothing happens on its own when an account is over: its links and apps keep working. The [Terms](https://dectog.com/terms) promise to contact the account first, so write to it about moving to a plan that fits. On a deployment without Creem billing the screen says billing is not enabled.

## Where the public blog lives

- The blog is served by the site host: `https://dectog.com/blog` and `https://dectog.com/blog/{slug}`.
- `https://app.dectog.com/blog` and `https://app.dectog.com/blog/{slug}` answer with a permanent redirect (301) to the same path and query string on the site host, like the other site pages asked of the dashboard host.
- Only published posts are public; a draft's URL returns a "not found" response. The public blog page loads up to 50 posts, with a search box and a category filter.
- A shared link to a published post previews as that post: its title, its excerpt and, when set, its featured image. See [Blog post pages](/api/well-known-seo-and-routing/#blog-post-pages).
- `https://dectog.com/sitemap.xml` lists the site pages and every published post, newest first; see [Well-known, SEO and routing](/api/well-known-seo-and-routing/).

:::note[Self-hosting]
The blog and the contact form are served on the worker's `SITE_URL` host, and the dashboard host (`WEB_URL`) redirects their paths there. The screens exist on every deployment; whether you use them is up to you.
:::
