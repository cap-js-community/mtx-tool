---
layout: default
title: User Authentication
nav_order: 3
---

<!-- prettier-ignore-start -->
# User Authentication
{: .no_toc}
<!-- prettier-ignore-end -->

<!-- prettier-ignore -->
- TOC
{: toc}

## Summary

The central point of the user authentication commands is obtaining
[JSON web tokens](https://en.wikipedia.org/wiki/JSON_Web_Token) or JWTs. Either

- to decode them and see which privileges and other information are passed along within them, or
- to use them as authorization for related rest APIs, e.g., services or the server.

Obtaining the tokens always happens through a service instance of the "User Account and Authentication Service"
(technical name `xsuaa`).

For details and background information regarding the service, please consult the official documentation:

- [https://help.sap.com/docs/CP_AUTHORIZ_TRUST_MNG](https://help.sap.com/docs/CP_AUTHORIZ_TRUST_MNG)

Commands for this area are:

```
   === user authentication (uaa) ===
~  uaad  --uaa-decode TOKEN                decode JSON web token
~  uaac  --uaa-client [TENANT]             obtain token for generic client
~  uaap  --uaa-passcode PASSCODE [TENANT]  obtain token for uaa one-time passcode
~  uaas  --uaa-service SERVICE [TENANT]    obtain token for uaa trusted service
~  uaai  --uaa-userinfo PASSCODE [TENANT]  user info for passcode
         ...    [TENANT]                   obtain token for tenant, fallback to paas tenant
         ...    --decode                   decode result token

~  are read-only commands
```

## Decoding JWTs

Without even setting up MTX Tool, you can always take any web token you have in your clipboard and run `mtx uaad <jwt>`.

Beyond this simple use case you might want to decode, for example, a user's session JWT, in order to see which
privileges that particular user has. In order to achieve this:

- Ask for the user's subdomain. In our example it will be `skyfin-company`.
- Run `mtx uaap 123 skyfin-company`, i.e., use a made up passcode.
- MTX Tool will tell you the correct, landscape-dependent UAA url, which the user should use to get their one-time
  passcode. In our example it is `https://skyfin-company.authentication.sap.hana.ondemand.com/passcode`.
- Using the user's one-time passcode run `mtx uaap vjcOkwoVFL4ig17YIebYJYgKODSK6rsL skyfin-company --decode`.

## Accessing Server APIs

If your server exposes an endpoint with JWT authentication, which is the default in CAP, then you can
access these endpoint with a JWT that mtx can get for you.

| accessor                     | get JWT with                        |
| :--------------------------- | :---------------------------------- |
| provider subaccount (paas)   | `mtx uaac`                          |
| subscriber subaccount (saas) | `mtx uaac <subdomain or tenant id>` |

Set the `Authorization` header as `Bearer <jwt>` in HTTP requests for the endpoints to pass validation. We use
[Postman](https://www.postman.com) for this, but any other HTTP client works as well.

## Accessing Service APIs

You can access services in the same way that the server accesses them, usually for debugging purposes. You will
need to know the label of the service and it needs to be bound to the app which is configured for user authentication.

For example `destination` is the label of the [BTP destination service](https://help.sap.com/docs/CP_CONNECTIVITY).
You will also need to choose a trusted subdomain to use, for example `skyfin-company`.

{: .info}
If the subdomain belongs to the
xsapp provider subaccount, then it will always be trusted. If the subdomain belongs to a different subaccount, it will
only be trusted if that account has successfully subscribed to the xsapp.

So, `mtx uaas destination skyfin-company`, will give you the corresponding JWT, which can then be decoded or used as
`Authorization` header in an HTTP client.

## Example for Saas Service

Here is an example of retrieving a JWT for the bound destination service:

![](user-authentication-service.gif)
