---
title: Account and sign-in
description: Creating an account, signing in with a password or with Google, resetting a password, the owner role, and the account changes the dashboard does not offer.
sidebar:
  order: 6
---

Sign-in lives at https://app.dectog.com/login. The page is titled **Dashboard Access** ("Sign in — or create an account — to manage your deep links") and has two tabs, **Log in** and **Sign up**. `https://app.dectog.com/login?tab=signup` opens the Sign up tab directly. A browser that already holds a valid session is sent straight to the dashboard.

## Sign up

| Field | Rules |
|---|---|
| **Email** | A valid address. Stored trimmed and lower-cased. |
| **Username** | Suggested from the part of your email before `@` until you edit it. 3 to 32 characters: lowercase letters, digits and hyphens, starting and ending with a letter or digit. Reserved names are refused: `app`, `www`, `api`, `links`, `dashboard`, `admin`, `mail`, `static`, `cdn`, `docs`, `status`, `help`, `support`, and any name starting with `t-`, the prefix of [test environments](/dashboard/settings/#test-environment). The hint reads "Your links live on {username}.{root domain}" (`dectog.com` on the hosted service): the username is your link subdomain and cannot be changed later. |
| **Password** | 8 to 72 characters with at least one lowercase letter, one uppercase letter and one digit. Hint: "At least 8 characters, with upper and lowercase letters and a number". |

**Create Account** submits. Errors, verbatim from the server: `Please enter a valid email address`; the password rule that failed, such as `Password must include an uppercase letter`; `Username must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric`; `Username '{name}' is reserved`; `An account with this email or username already exists`; and `Signup is currently closed` when the deployment has closed signups, in which case the Sign up tab is hidden as well.

On success you are signed in and see **Account created — you are signed in.** with two keys: **SDK key, for your app** (listed again under Settings → [SDK keys](/dashboard/settings/#sdk-keys)) and **Account key, for servers and scripts**, which this screen shows once: "Copy it now: it is not shown again (Settings can replace it)." Then **Go to dashboard**.

A footer line reads "Your account gets its own link subdomain and API key." Every account created through signup has the `user` role (see [Roles](#roles)).

## Log in

| Field | Behavior |
|---|---|
| **Email**, **Password** | Checked locally first: `Please enter a valid email address`, `Password is required`. |
| **Remember me for 30 days** | Checked: the browser keeps the session cookie for 30 days. Unchecked: the cookie is deleted when the browser closes. |
| **Sign In** | Errors: `Invalid email or password` for a wrong pair, `An unexpected error occurred` for anything else. More than 10 attempts in a minute from one network show `Too many sign-in attempts. Wait a minute and try again.` until the minute ends. There is no per-account lockout. |
| **Forgot password?** | Opens the reset form described below. |
| **Sign in with Google** | Shown when the deployment has Google sign-in configured. |

The session is a cookie named `dectog_session` holding a signed token that expires 30 days after sign-in whatever the checkbox; the checkbox only decides whether the browser keeps the cookie across restarts. **Log out** (the icon in the sidebar footer) deletes the cookie and returns to the login page; sessions open in other browsers keep running until their token expires. Two things end every session at once, in every browser: [resetting the password](#forgot-and-reset-password) and [connecting Google](#connect-google).

Local development builds also show "Demo account: demo@dectog.local · demo1234" under the form; the hosted service does not.

## Sign in with Google

**Sign in with Google** (or **Sign up with Google** on the Sign up tab) sends you to Google's account chooser and back, through a server-side OAuth authorization-code flow with PKCE. What happens next depends on the Google account and its verified email:

| Situation | Result |
|---|---|
| The Google account is connected to a DecTog account. | You are signed in, whatever its email is now. |
| A DecTog account uses the same email and has no Google account connected. | Error: `A DecTog account already uses that email. Sign in with its password, then connect Google in Settings → Account.` Nothing is linked. |
| A DecTog account uses the same email but is connected to a different Google account. | Error: `That email is already linked to a different Google account.` |
| No account uses the email and signups are open. | One more step: **Signed in with Google as {email}. One last step:** with a **Choose a username** box that follows the signup rules. **Create Account** creates the account and shows the API key screen; **Cancel** abandons it. You have 15 minutes to finish, after which the page reports `Google sign-in expired — try again`. |
| No account uses the email and signups are closed. | Error: `No DecTog account uses that Google email, and signup is currently closed.` |

Other errors shown on return: `Google sign-in was cancelled.`; `Google sign-in timed out — please try again.` (the handshake must complete within 10 minutes); `Couldn't verify your Google account — please try again.`; `Google sign-in is not available right now.`. Username errors on the last step: `That username is taken` and `An account with this Google email already exists — sign in instead`.

An account created through Google has no usable password: the server stores a random one. To sign in with a password later, use **Forgot password?** to set one.

### Connect Google

A matching email is not enough to link an existing account: sign-up does not check that the address belongs to whoever signs up, so an account with your email might not be yours. To add Google sign-in to an account you have, sign in with its password, open Settings → **Account**, and select **Connect Google** next to **Sign in with Google** (shown when the deployment has Google sign-in configured). Choose the Google account; back in Settings, "Google is connected" confirms it, and the row reads **Connected**. Any Google account works, whatever its email. Connecting signs out every other session of the account; this browser stays signed in.

Errors shown in Settings: `That Google account already signs in to another DecTog account.`, `Your sign-in is already connected to a different Google account.`, `Connecting Google was cancelled.`, `Connecting Google timed out. Please try again.`, `Couldn't verify your Google account. Please try again.`. Connecting cannot be undone from the dashboard.

If an account with your email exists that you did not create, use **Forgot password?**: the reset link goes to your address, and the new password signs out every session of whoever made it.

## Forgot and reset password

**Forgot password?** shows **Reset Password** ("Enter your email to receive a reset link") with an **Email** box and **Send Reset Link**. The reply is "If that email exists, a reset link is on its way.", whether or not an account exists. More than 5 requests a minute from one network, or 3 a minute for one address, show `Too many reset requests. Wait a minute and try again.`

The email, with the subject "Reset your DecTog password", carries a link to `https://app.dectog.com/reset-password?token=…`. The token:

- is valid for 1 hour;
- can be used once; the server marks it used in the same step that changes the password, so a second submit fails;
- is cancelled by any newer request: only the most recent link works.

The reset page ("Choose a new password for your account") has **New password** and **Confirm new password** boxes and an **Update Password** button. Errors: `This reset link is missing its token — open the link from your email.`, the password rules, `Passwords do not match`, `This reset link is invalid or has expired`, `This reset link has already been used`. Success: "Password updated — sign in with your new password." The reset does not sign you in, and it ends every session of the account, in every browser.

## Teams

Several people can work in one account. Each person signs in as themselves, to their own account, and the account's owners invite others from Settings → [Team](/dashboard/settings/#team), each with a role:

| Role | Can |
|---|---|
| **Owner** | Everything: links, apps, webhooks, customers and exports, plus the keys, the team, the custom domain, the revenue currency, the retention window, the test environment, and erasing a device or a customer. |
| **Member** | Links, link templates, temporary links, apps, webhooks, customers, exports and the audit log. Sees the SDK keys but does not create or revoke them. |
| **Viewer** | Reads the numbers: Overview, Links, Apps and the parts of Settings without keys. No customers, exports, keys or audit log. |

The person who owns an account is always its owner, and cannot be removed or demoted. Owners can make others owners too.

### Joining by invite

An invite email links to `{WEB_URL}/invite?token=…`. The link works for 7 days, once, and only for the invited address: sign in, or create an account, with that email, and select **Join**. A person signed in with another address is told so. Every person has an account of their own, with its own username and keys, whether they use it or not.

After joining, an **Account** menu at the top of the sidebar lists your own account and every account you belong to, each with your role there; choosing one reloads the dashboard on it, on its live data. **Leave** at the bottom of the Team card leaves the account shown; an owner has to invite you again. When an owner removes you, your next request lands on your own account.

## Roles

Every account also has a platform role: `owner` or `user`. It is separate from the team roles above.

- **Users** see Overview, Links, Apps, Customers and Settings of the account chosen in the **Account** menu, as far as their team role there allows (a viewer has no Customers). There is no cross-account view.
- The **owner** additionally sees **Blog** and **Messages** in the sidebar; see [Blog and messages](/dashboard/blog-and-messages/). Non-owners who open `/dashboard/blog` or `/dashboard/messages` by URL are sent back to the Overview, and the API answers `403 Owner access required`.

The owner is the account created by the deployment's bootstrap call, or by the local demo seed. When the role column was introduced, the oldest existing account became the owner. Signup and Google sign-in always create `user` accounts, and there is no screen or API call to change a role. On the hosted service, accounts created through signup are `user` accounts with the full dashboard; Blog and Messages belong to the site operator.

## What the dashboard does not offer

- **Renaming the username.** It is your link subdomain; there is no endpoint to change it.
- **Changing the email.**
- **Transferring an account.** Owners can add owners, but the account's own login stays its owner.
- **Deleting the account.** Links can be deleted one by one, which removes their data; the account itself cannot. Contact the operator of the deployment.
- **Changing the password while signed in.** Use **Forgot password?** and the emailed link.
- **Ending other sessions.** A session ends when its token expires, 30 days after sign-in.

:::note[Self-hosting]
Signups are open unless the worker's `OPEN_SIGNUPS` variable is `"0"`. Google sign-in appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, with `{WEB_URL}/api/auth/google/callback` registered as the redirect URI. Reset emails go through Resend with `RESEND_API_KEY`; without it, the reset link is printed to the worker's log instead. The hint under the username box always says `.dectog.com`, even when your links live under another root domain. See [Configuration reference](/self-hosting/configuration-reference/) and, for creating the owner account, [Local quick start](/self-hosting/local-quick-start/).
:::
