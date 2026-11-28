---
title: Live rows in the browser
description: A pivotkit-react report or pivotkit-element that reads its rows from pivotkit-server itself, with a short-lived browser token from the page's getToken() - the server prop and the server-url attribute, the parameters, the token's renewal, the states the report shows and Copy link.
---

# Live rows in the browser

## pivotkit-react { #server }

`server` points the report at a source of [pivotkit-server](records.md#records-browser). The report
reads the rows itself, with a short-lived browser token that the page's `getToken()` gives. They
take the place of `data`; a report with both shows the server's rows and says so once in the
console.

```jsx
const getToken = async (request) => {
    // your backend exchanges the person's token at POST /api/v1/sources/records/token
    const answer = await fetch("/my-backend/pivotkit-token", { method: "POST", body: JSON.stringify(request) });
    if (!answer.ok) throw Object.assign(new Error("refused"), { problem: await answer.json() });
    return answer.json(); // { token, expiresAt, … } as the exchange route answers, or the token alone
};
<PivotReport server={{ url: "https://reports.example.com", source: "sales", getToken, allowParams: ["customer"] }} />
```

| Key | What it is |
| --- | --- |
| `url` | The server's address, `http` or `https`, without a user name. Your code names it; a link never does. |
| `source` | The source id. A view link's own source does not change it. |
| `getToken` | `({ source, params, access? }) => token`, or a promise of it. See below. |
| `allowParams` | The source's parameters the page's query string may set (`?customer=acme`). None by default. A name given twice counts once, with its first value. |
| `refreshKey` | Any value: a new one reads the rows again, while the report keeps showing the ones it has. |

### getToken { #gettoken }

`getToken` gets what to read: the source, the parameters from the query string, and the link's
access level (`pk-access` of the query string) when there is one. It gives:

- the exchange route's answer, or the token as a text. The report keeps it in memory and sends it in
  the `Authorization` header only, never in an address. It asks again 15 seconds before `expiresAt`.
- nothing (`null`, `""`): the person must sign in again. The report says so.
- an error with `problem`, the exchange route's answer: the report shows its state. Any other error
  is the state `signIn`.

A 401 from the rows route asks `getToken` once more and tries again once. Only when that fails too
does the report say that the sign-in ended.

### What the report shows { #states }

- While it loads, its skeleton. After 3 seconds, one line over it says that a large report takes a
  few seconds.
- No rows yet and a refusal: a message in place of the report. It says what happened, what the
  person can do, and a line for IT support with the server's code and request id.
- Rows already, and reading them again failed: a banner above the report says from when the rows
  are.

| `state` | When |
| --- | --- |
| `refused` | The person may not read this source or these parameters (403, 404). |
| `linkRefused` | The link's [access level](records.md#records-access) shuts this account out. |
| `linkInvalid` | The link's access level is not valid, no longer offered or missing: ask for a new link. |
| `unfit` | The request does not fit the source, such as a parameter it does not take (400, 422). |
| `expired` | `getToken` gave no new token, or the new one was refused too. |
| `signIn` | `getToken` failed without a `problem`: the page's sign-in step, not the report server. |
| `signInLarge` | The sign-in carries more groups or claims than a browser token holds. |
| `large` | More rows or values than the server's limit (413 `LIMIT_EXCEEDED`). |
| `busy` | The server is busy (503, 429). The text names its `Retry-After`. **Try again** reads once more. |
| `unreachable` | No answer, an answer that broke off, or a server error. |

The texts are under `labels.server` ([localisation](localisation.md)). The network code, the states
and their texts load on first use, so a report without `server` loads none of it.

A `url` over `http` that is not this machine gets one warning in the console: the token would cross
the network in clear text.

Copy link keeps the parameters the report read and `pk-access`. The toast and the share note name the
parameters: whoever opens the link reads with their own account's rights.

## pivotkit-element { #element }

Attributes: `server-url`, `server-source`, `server-params`. Property only: `getToken`.

The report reads its rows from [pivotkit-server](records.md#records-browser) with a browser token,
as the React prop `server` does. It shows the server's rows in place of `data`.

```html
<pivot-report server-url="https://reports.example.com" server-source="sales" server-params="customer"></pivot-report>
<script type="module">
  const report = document.querySelector("pivot-report");
  report.getToken = async (request) => {
    const answer = await fetch("/my-backend/pivotkit-token", { method: "POST", body: JSON.stringify(request) });
    if (!answer.ok) throw Object.assign(new Error("refused"), { problem: await answer.json() });
    return answer.json();
  };
</script>
```

- `getToken` works as [above](#gettoken). Until it is set, the report waits.
- `report.refresh()` reads the rows again. The report keeps showing the rows it has meanwhile, and a
  banner says from when they are if the new read fails.
- Each state is a `pivot-server-state` event.
- The page's [Content-Security-Policy](element.md#content-security-policy) needs the server's origin in
  `connect-src`, and the server needs the page's origin in [`rest.browser.origins`](records.md#records-browser-origins).
