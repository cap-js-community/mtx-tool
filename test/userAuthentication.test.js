"use strict";

const fetchMock = require("node-fetch");
jest.mock("node-fetch");
const sharedStaticMock = require("../src/shared/static");
jest.mock("../src/shared/static", () => require("./__mocks/shared/static"));
const sharedOAuthMock = require("../src/shared/oauth");
jest.mock("../src/shared/oauth", () => require("./__mocks/shared/oauth"));

const uaa = require("../src/submodules/userAuthentication");

const SUBDOMAIN = "subdomain";
const PASSCODE = "passcode90";
const USERNAME = "username";
const PASSWORD = "password90";
const SERVICE = "service";
const APP_NAME = "appname";

const PAAS_CLIENT_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoia2V5LWlkLTEiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NDlhYmVlZWFjYzY0OWY2OGFmNTg5Y2FmZTMzYTJjNiIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4ifSwic3ViIjoic2ItYWZjLWRldiF0NTg3NCIsImF1dGhvcml0aWVzIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sInNjb3BlIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sImNsaWVudF9pZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJjaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXpwIjoic2ItYWZjLWRldiF0NTg3NCIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJyZXZfc2lnIjoiYWI1OTRmNDMiLCJpYXQiOjE2MjE1MTQzNTksImV4cCI6MTYyMTU1NzU1OSwiaXNzIjoiaHR0cDovL3NreWZpbi5sb2NhbGhvc3Q6ODA4MC91YWEvb2F1dGgvdG9rZW4iLCJ6aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJhdWQiOlsidWFhIiwic2ItYWZjLWRldiF0NTg3NCIsImFmYy1kZXYhdDU4NzQiXX0.u5LbQ7T01RNOwovupuLqi2xv9Sq8QPizY1k9MB4iNTnE6PrEacVaYhZFjBGuqRU6RDjIdfB1drzSGm1MwtrRAYkwWthu9YAfgHVanujXpjkD6NOE6J4sMfmJoy7e9BewJwPZ6l8k6G_Jqnm-9vURMlzjXRXqr1UyAVxlcqc4ZMikVc-25_XvYJKgp_qnbX1kBUwxECeTWtIB80SbroCgbGMwKCck58JyLr2RrZ4ZEPApeE-rWXFGDPtpmECzPRRl2aptA2Nur3fdl5g8Sqih5i_sSmIWMeoeViMVAgbbTZ-graNzcWB8yHri8UNZVihcl5cRAXH9Gvw4kNcYhSxP-Q";
const SAAS_CLIENT_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI5OTQ0NmY2YzNmOWU0NWI1OTNhYWU0MDA0ODkwZjk3YSIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSJ9LCJzdWIiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXV0aG9yaXRpZXMiOlsidWFhLnJlc291cmNlIiwiYWZjLWRldiF0NTg3NC5tdGRlcGxveW1lbnQiLCJhZmMtZGV2IXQ1ODc0Lm10Y2FsbGJhY2siXSwic2NvcGUiOlsidWFhLnJlc291cmNlIiwiYWZjLWRldiF0NTg3NC5tdGRlcGxveW1lbnQiLCJhZmMtZGV2IXQ1ODc0Lm10Y2FsbGJhY2siXSwiY2xpZW50X2lkIjoic2ItYWZjLWRldiF0NTg3NCIsImNpZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJhenAiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiZ3JhbnRfdHlwZSI6ImNsaWVudF9jcmVkZW50aWFscyIsInJldl9zaWciOiI0ZDczMTQ4ZSIsImlhdCI6MTYyMTUxNTMyNiwiZXhwIjoxNjIxNTU4NTI2LCJpc3MiOiJodHRwczovL3NreWZpbi1jb21wYW55LmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS9vYXV0aC90b2tlbiIsInppZCI6IjVlY2M3NDEzLTJiN2UtNDE0YS05NDk2LWFkNGE2MWY2Y2NjZiIsImF1ZCI6WyJ1YWEiLCJzYi1hZmMtZGV2IXQ1ODc0IiwiYWZjLWRldiF0NTg3NCJdfQ.fp3nMFh0NvqGqMNXPyeY9SCQBVvXbi2MgV6p3nQ9X8YXUjT758E0q405FY3dWxo5pqwAk75MHdr-A_PpxM4X99CGsjKe5Jm_-BlVjLs0bYOMbfo-pSTKb9iPBY_8ACsA1dn8XTDBH8ZRLtaz00v0Hc1a6dbpsABiXp_H1HYs8Q93XghtqBJegs5YK8vxLsvPiWS8fZKm577QYtIpx6e4p9ThPIxY3c5BPPARRKhrwWlSYeRxwcWd3uhDeC3O_PSomAeUV21KJym4_tLB4Pw35rbnNhVyCy1SklL7FMXPkhbC6vmlF7_ID17yhY8hsaLIVrpTrVksgKmjNXqkOguaQw";
const PAAS_PASSCODE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoia2V5LWlkLTEiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NWJiY2NlM2FmNDA0YmUxYWQzMzIyOGE5NjYwYTFlZCIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4ifSwieHMuc3lzdGVtLmF0dHJpYnV0ZXMiOnsieHMucm9sZWNvbGxlY3Rpb25zIjpbIkFGQ19BTEwiXX0sImdpdmVuX25hbWUiOiJSaWNoYXJkIiwieHMudXNlci5hdHRyaWJ1dGVzIjp7fSwiZmFtaWx5X25hbWUiOiJMaW5kbmVyIiwic3ViIjoiMDMxMDk4MjgtNjIwZS00ZTk2LWEzZmUtMTI4NWJiYWJmZWI4Iiwic2NvcGUiOlsiYWZjLWRldiF0NTg3NC5Qcm92aWRlciIsImFmYy1kZXYhdDU4NzQuQUZDX1N5c3RlbUFkbWluIiwiYWZjLWRldiF0NTg3NC5Db25zdW1lciIsImFmYy1kZXYhdDU4NzQuQUZDX1JlcG9ydGluZyIsImFmYy1kZXYhdDU4NzQuQUZDX1VzZXIiLCJvcGVuaWQiLCJ1YWEudXNlciIsImFmYy1kZXYhdDU4NzQuRXh0ZW5kQ0RTZGVsZXRlIiwiYWZjLWRldiF0NTg3NC5BRkNfRGVmaW5lIiwiYWZjLWRldiF0NTg3NC5LRVlVU0VSIiwiYWZjLWRldiF0NTg3NC5FeHRlbmRDRFMiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Vc2VyTWFuYWdlbWVudCIsImFmYy1kZXYhdDU4NzQuQUZDX0FwcHJvdmUiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db21wbGlhbmNlIiwiYWZjLWRldiF0NTg3NC5BRkNfUHJvY2VzcyIsImFmYy1kZXYhdDU4NzQuQUZDX0NvbmZpZyJdLCJjbGllbnRfaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiY2lkIjoic2ItYWZjLWRldiF0NTg3NCIsImF6cCI6InNiLWFmYy1kZXYhdDU4NzQiLCJncmFudF90eXBlIjoicGFzc3dvcmQiLCJ1c2VyX2lkIjoiMDMxMDk4MjgtNjIwZS00ZTk2LWEzZmUtMTI4NWJiYWJmZWI4Iiwib3JpZ2luIjoibGRhcCIsInVzZXJfbmFtZSI6InJpY2hhcmQubGluZG5lckBzYXAuY29tIiwiZW1haWwiOiJyaWNoYXJkLmxpbmRuZXJAc2FwLmNvbSIsInJldl9zaWciOiI5ZDdjNDRjNCIsImlhdCI6MTYyMTUxNjQ2MSwiZXhwIjoxNjIxNTU5NjYxLCJpc3MiOiJodHRwOi8vc2t5ZmluLmxvY2FsaG9zdDo4MDgwL3VhYS9vYXV0aC90b2tlbiIsInppZCI6IjdiMjA0MDhlLTNmZTAtNGFkZS1hYTJlLWFkOTdiYWFjNzJlOCIsImF1ZCI6WyJ1YWEiLCJvcGVuaWQiLCJzYi1hZmMtZGV2IXQ1ODc0IiwiYWZjLWRldiF0NTg3NCJdfQ.pJYyKHSYSnSMy2HIzb2Cp9IlXb0ntWj7tkcsuuI2mn3X4sHziuyUp_G8KemM9hLdh47bo-ZySoG_TaI5K0sHtULIOsH8g2lruNcyi9rzVpuRZE-M7WFPnrNuP85hZ5fKY0OGz4JAF9H9UHDtJk36cqXSV1UHUu2Rv0TaWDOW8GTY9wDfkPYEAVN7TQPyxTJN8GgpmtwOdaL_LgU3yECLEK7R3FY0xWV6JWCF526GQwDU-ZB_re3dKBzXDWdszXvNcaiN0f9zF8M1C2MBgop0LgUUQToqW0Zi5xEzBjYoVkZuMwtkHD54cPzLV5hp-XnuPryZUqWaYqhTYddCLOBgTA";
const SAAS_PASSCODE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NmJmMGYyODBiNzc0MTdiOTMxOTE3MTNmYWUwZGI2NSIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSJ9LCJ4cy5zeXN0ZW0uYXR0cmlidXRlcyI6eyJ4cy5yb2xlY29sbGVjdGlvbnMiOlsiQUZDX0FMTCJdfSwiZ2l2ZW5fbmFtZSI6IlJpY2hhcmQiLCJ4cy51c2VyLmF0dHJpYnV0ZXMiOnt9LCJmYW1pbHlfbmFtZSI6IkxpbmRuZXIiLCJzdWIiOiJhOGEzN2FiNy0wMDU2LTRkNGItYjNkNy1mNzBlYWQ5MmM4MjkiLCJzY29wZSI6WyJhZmMtZGV2IXQ1ODc0LlByb3ZpZGVyIiwiYWZjLWRldiF0NTg3NC5Db25zdW1lciIsImFmYy1kZXYhdDU4NzQuQUZDX1JlcG9ydGluZyIsImFmYy1kZXYhdDU4NzQuQUZDX1VzZXIiLCJvcGVuaWQiLCJhZmMtZGV2IXQ1ODc0LkV4dGVuZENEU2RlbGV0ZSIsImFmYy1kZXYhdDU4NzQuS0VZVVNFUiIsImFmYy1kZXYhdDU4NzQuRXh0ZW5kQ0RTIiwiYWZjLWRldiF0NTg3NC5BRkNfQXBwcm92ZSIsImFmYy1kZXYhdDU4NzQuQUZDX1Byb2Nlc3MiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db25maWciLCJhZmMtZGV2IXQ1ODc0LkFGQ19TeXN0ZW1BZG1pbiIsInVhYS51c2VyIiwiYWZjLWRldiF0NTg3NC5BRkNfRGVmaW5lIiwiYWZjLWRldiF0NTg3NC5BRkNfVXNlck1hbmFnZW1lbnQiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db21wbGlhbmNlIl0sImNsaWVudF9pZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJjaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXpwIjoic2ItYWZjLWRldiF0NTg3NCIsImdyYW50X3R5cGUiOiJwYXNzd29yZCIsInVzZXJfaWQiOiJhOGEzN2FiNy0wMDU2LTRkNGItYjNkNy1mNzBlYWQ5MmM4MjkiLCJvcmlnaW4iOiJzYXAuZGVmYXVsdCIsInVzZXJfbmFtZSI6InJpY2hhcmQubGluZG5lckBzYXAuY29tIiwiZW1haWwiOiJyaWNoYXJkLmxpbmRuZXJAc2FwLmNvbSIsInJldl9zaWciOiI1NzRmMDc1IiwiaWF0IjoxNjIxNTE2NTkzLCJleHAiOjE2MjE1NTk3OTMsImlzcyI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL29hdXRoL3Rva2VuIiwiemlkIjoiNWVjYzc0MTMtMmI3ZS00MTRhLTk0OTYtYWQ0YTYxZjZjY2NmIiwiYXVkIjpbInVhYSIsIm9wZW5pZCIsInNiLWFmYy1kZXYhdDU4NzQiLCJhZmMtZGV2IXQ1ODc0Il19.o-hXO2NWSaG3PQRfVdOVL93LoY2SJZ-grl2WLuY2UA94D09Obvg32EB-0yNwtfdEJb-eR2vkrwSh64n0J1u8b7JCPl_9ddQysXb_NsoUvxQXmi9kpTKwD6nQTwFc6mYz8dn4UeERkAbMWFHhF16iDRwmPT5v9l_57u-YRSUjW9azgB5Lf8X9NBzk0N94f_FWtZNnNNe_eK0uTkx8QP2T3w2fLtsSX2HMg4W5DCRaf-67XezHPOMYfcSz0rIb18dBSl6h9_nirl-Tjm8RcINytZLsQNA_iuZ18vvjJloTvmrdDMgh7EI70R3oCoaGovvagKg7WwXs3QFTqj6xj6ilNg";

const SAAS_USER_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QiLCJqaWQiOiAiZitoQmFXbXZHTVlUZis3STFTaDVlNEpvS1hjN05QV2wrbGVhR0ZTS0hFST0ifQ.eyJqdGkiOiI1NTNiYjVkYmM1NzE0Y2FkOTAwY2I4MGFlZmNjODI4NCIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSIsIm9pZGNJc3N1ZXIiOiJodHRwczovL2F3ZHNwOGVmNC5hY2NvdW50czQwMC5vbmRlbWFuZC5jb20ifSwidXNlcl91dWlkIjoiYWJiOWRkOWItYjAxMi00ZGY3LWJjY2YtNDFlZDg2NzZjYWIzIiwieHMudXNlci5hdHRyaWJ1dGVzIjp7fSwiY25mIjp7Ing1dCNTMjU2IjoiaVdWRDExOWRidnlhNW9LSW9UVWxXQ2lTOHF0SVRZSGFhVlUzN1o3aDBMMCJ9LCJ4cy5zeXN0ZW0uYXR0cmlidXRlcyI6eyJ4cy5yb2xlY29sbGVjdGlvbnMiOlsiQUZDX0FMTCJdfSwiZ2l2ZW5fbmFtZSI6IkRlZmF1bHQiLCJmYW1pbHlfbmFtZSI6IlRlc3RVc2VyIiwic3ViIjoiOWI4ODAzMjAtZDVmOC00NDg3LTkxN2MtYmMwZThjYzcwZDZmIiwic2NvcGUiOlsiYWZjLWRldiF0NTg3NC5Qcm92aWRlciIsImFmYy1kZXYhdDU4NzQuQ29uc3VtZXIiLCJhZmMtZGV2IXQ1ODc0LkFGQ19SZXBvcnRpbmciLCJhZmMtZGV2IXQ1ODc0LkFGQ19Vc2VyIiwib3BlbmlkIiwiYWZjLWRldiF0NTg3NC5FeHRlbmRDRFNkZWxldGUiLCJhZmMtZGV2IXQ1ODc0LkFGQ19SZXBvcnRpbmdUYXNrVmlldyIsImFmYy1kZXYhdDU4NzQuS0VZVVNFUiIsImFmYy1kZXYhdDU4NzQuRXh0ZW5kQ0RTIiwiYWZjLWRldiF0NTg3NC5BRkNfQVBJX0FjY2VzcyIsImFmYy1kZXYhdDU4NzQuQUZDX1JlcG9ydGluZ09yZ1VuaXRWaWV3IiwiYWZjLWRldiF0NTg3NC5BRkNfQXJjaGl2aW5nIiwiYWZjLWRldiF0NTg3NC5BRkNfQXBwcm92ZSIsImFmYy1kZXYhdDU4NzQuQUZDX1Byb2Nlc3MiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db25maWciLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db21wYW55Q29kZUdyb3Vwc0FwcCIsImFmYy1kZXYhdDU4NzQuQUZDX1N5c3RlbUFkbWluIiwidXNlcl9hdHRyaWJ1dGVzIiwiYWZjLWRldiF0NTg3NC5BRkNfTWlncmF0aW9uIiwidWFhLnVzZXIiLCJhZmMtZGV2IXQ1ODc0LkFGQ19EZWZpbmUiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Vc2VyTWFuYWdlbWVudCIsImFmYy1kZXYhdDU4NzQuQUZDX0NvbXBsaWFuY2UiXSwiY2xpZW50X2lkIjoic2ItYWZjLWRldiF0NTg3NCIsImNpZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJhenAiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiZ3JhbnRfdHlwZSI6InBhc3N3b3JkIiwidXNlcl9pZCI6IjliODgwMzIwLWQ1ZjgtNDQ4Ny05MTdjLWJjMGU4Y2M3MGQ2ZiIsIm9yaWdpbiI6InNhcC5jdXN0b20iLCJ1c2VyX25hbWUiOiJ0ZXN0dXNlckBzYXAuY29tIiwiZW1haWwiOiJ0ZXN0dXNlckBzYXAuY29tIiwiYXV0aF90aW1lIjoxNzA4MDAzNDYzLCJyZXZfc2lnIjoiNDQwOGRiNGYiLCJpYXQiOjE3MDgwMDM0NjMsImV4cCI6MTcwODAwNzA2MywiaXNzIjoiaHR0cHM6Ly9za3lmaW4tY29tcGFueS5hdXRoZW50aWNhdGlvbi5zYXAuaGFuYS5vbmRlbWFuZC5jb20vb2F1dGgvdG9rZW4iLCJ6aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJhdWQiOlsidWFhIiwib3BlbmlkIiwic2ItYWZjLWRldiF0NTg3NCIsImFmYy1kZXYhdDU4NzQiXX0.PavhBjPw79BPwsq02hGXHqxzSKdFRjwvmwqJFKMNH2e1h6CqEeCzbUpK0depFsEwUr8iqo-C3Mo8Kdb07vj4sVOfltyyKrynsMv9MkTRX8MN8Je9tmLtTR3NJ92emGrN367ivT8rpuq_oFMlDjnbNVldYitP1azXhDALM64Um60InWE1zHX7fIdS00Du7CFmTQm4YKJ2gSD4u1MrwjzABdNuInyhU9Alr6koXSuzRLvpb4ALIxwH1pSnVS3BWzRDJ2yPCn02vha7W9MPtIbvSwgtecK0NscMXbJ4GFBcPbzLyW4W8T_n9jlKW3czL9yA5skbS5rfAHwo9YsecDI7hg";

const SAAS_SERVICE_CLIENT_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoiand0LXNpZy0yMDI0LTAyLTE1IiwidHlwIjoiSldUIiwiamlkIjogIkhRMTNnQVJ2VjZ0OHdCeFZVL0lrNExTKzI1dEsvbnNtSWtLSUZLNG16SjA9In0.eyJqdGkiOiJkNzBjM2E5MzM2NzM0Njg0YTQ1ZWViYWFlZTcxZWRjOSIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4iLCJzZXJ2aWNlaW5zdGFuY2VpZCI6IjUxZGRkMThiLTVhNzgtNDE4ZS04ZjQxLTlhNGM1MTg2NTBlYyJ9LCJjbmYiOnsieDV0I1MyNTYiOiJEYmhta19zbTR0NnhEd1ZZYVYyWXAtcGJLR1NLdHpDSkcxZUtnY3Z5ZU40In0sInN1YiI6InNiLTUxZGRkMThiLTVhNzgtNDE4ZS04ZjQxLTlhNGM1MTg2NTBlYyFiNTg3NHxzZXJ2aWNlLW1hbmFnZXIhYjQwNjUiLCJhdXRob3JpdGllcyI6WyJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc2NvcGVzLmNvbnRhaW5lciIsInVhYS5yZXNvdXJjZSIsInNlcnZpY2UtbWFuYWdlciFiNDA2NS5zdWJhY2NvdW50LnNlcnZpY2VfaW5zdGFuY2UubWFuYWdlIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9iaW5kaW5nLm1hbmFnZSIsInNlcnZpY2UtbWFuYWdlciFiNDA2NS5zdWJhY2NvdW50LnNlcnZpY2VfcGxhbi5yZWFkIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9iaW5kaW5nLnJlYWQiLCJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc3ViYWNjb3VudC5zZXJ2aWNlX29mZmVyaW5nLnJlYWQiLCJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc3ViYWNjb3VudC5zZXJ2aWNlX2luc3RhbmNlLnJlYWQiXSwic2NvcGUiOlsic2VydmljZS1tYW5hZ2VyIWI0MDY1LnNjb3Blcy5jb250YWluZXIiLCJ1YWEucmVzb3VyY2UiLCJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc3ViYWNjb3VudC5zZXJ2aWNlX2luc3RhbmNlLm1hbmFnZSIsInNlcnZpY2UtbWFuYWdlciFiNDA2NS5zdWJhY2NvdW50LnNlcnZpY2VfYmluZGluZy5tYW5hZ2UiLCJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc3ViYWNjb3VudC5zZXJ2aWNlX3BsYW4ucmVhZCIsInNlcnZpY2UtbWFuYWdlciFiNDA2NS5zdWJhY2NvdW50LnNlcnZpY2VfYmluZGluZy5yZWFkIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9vZmZlcmluZy5yZWFkIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9pbnN0YW5jZS5yZWFkIl0sImNsaWVudF9pZCI6InNiLTUxZGRkMThiLTVhNzgtNDE4ZS04ZjQxLTlhNGM1MTg2NTBlYyFiNTg3NHxzZXJ2aWNlLW1hbmFnZXIhYjQwNjUiLCJjaWQiOiJzYi01MWRkZDE4Yi01YTc4LTQxOGUtOGY0MS05YTRjNTE4NjUwZWMhYjU4NzR8c2VydmljZS1tYW5hZ2VyIWI0MDY1IiwiYXpwIjoic2ItNTFkZGQxOGItNWE3OC00MThlLThmNDEtOWE0YzUxODY1MGVjIWI1ODc0fHNlcnZpY2UtbWFuYWdlciFiNDA2NSIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJyZXZfc2lnIjoiZmY0NzI3NTMiLCJpYXQiOjE3MDgwMTEyNTEsImV4cCI6MTcwODAxMzA1MSwiaXNzIjoiaHR0cHM6Ly9za3lmaW4uYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL29hdXRoL3Rva2VuIiwiemlkIjoiN2IyMDQwOGUtM2ZlMC00YWRlLWFhMmUtYWQ5N2JhYWM3MmU4IiwiYXVkIjpbInNlcnZpY2UtbWFuYWdlciFiNDA2NS5zY29wZXMiLCJzZXJ2aWNlLW1hbmFnZXIhYjQwNjUuc3ViYWNjb3VudC5zZXJ2aWNlX29mZmVyaW5nIiwidWFhIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9wbGFuIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9iaW5kaW5nIiwic2VydmljZS1tYW5hZ2VyIWI0MDY1LnN1YmFjY291bnQuc2VydmljZV9pbnN0YW5jZSIsInNiLTUxZGRkMThiLTVhNzgtNDE4ZS04ZjQxLTlhNGM1MTg2NTBlYyFiNTg3NHxzZXJ2aWNlLW1hbmFnZXIhYjQwNjUiXX0.BXwp9pc796cDP_d_OFu6ji9WscCwiHq5R5ARD71WC8V0kKOrBC0RUrSwZyjf0f1to8Qp519-ebktklO8BmZhSzma9-j7CJfUyIJr-p91WQtFRfXSmW-8drJ1_Jp8kuWViHnl0HiHPTshZYgB2eKM-g0k_tfxlsb8CtHbqtXDsjQzGptETodYEAO8lRVABb5-U1hf1PQupXm3FgI66ucKn7beBj4eta5iUYshsUI9_hPorwohO2J1HLBvj7TX36SCsd43nq5IVoIw-7NQ0RBTAF0_a5PMDTsVSCEGY20N14pgU6oXy5HWHzWJY1MaSGOGiarv5sDWk-YkijprBtvzUw";
const SAAS_SERVICE_PASSCODE_TOKEN = "";
const SAAS_SERVICE_USER_TOKEN = "";

const uaaUserInfoMock = {
  userStuff: "details",
};

const uaaCfServiceMock = {
  credentials: {
    url: "https://identityzone.authentication",
    identityzone: "identityzone",
    clientid: "clientid",
    clientsecret: "clientsecret",
  },
};

const cfEnvServicesMock = {
  url: "serviceurl",
  clientid: "serviceclientid",
  clientsecret: "serviceclientsecret",
};

const contextMock = {
  getUaaInfo: jest.fn(() => ({ cfService: uaaCfServiceMock })),
  getCachedUaaToken: jest.fn((options) => {
    return contextMock.getCachedUaaTokenFromCredentials(options);
  }),
  getCachedUaaTokenFromCredentials: jest.fn((options) => {
    return sharedOAuthMock
      .getUaaTokenFromCredentials(uaaCfServiceMock.credentials, options)
      .then(({ access_token }) => access_token);
  }),
};

let loggerSpy = {
  info: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};

describe("uaa tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("without context", () => {
    test("uaaDecode", async () => {
      const result = await uaa.uaaDecode([PAAS_CLIENT_TOKEN]);
      expect(sharedStaticMock.isJWT).toHaveBeenCalledTimes(1);
      expect(sharedStaticMock.isJWT).toHaveBeenCalledWith(PAAS_CLIENT_TOKEN);
      expect(result).toMatchSnapshot();
    });
  });

  describe("xsuaa tokens", () => {
    test.each([
      ["paas client default", PAAS_CLIENT_TOKEN, [], [false]],
      ["paas client --decode", PAAS_CLIENT_TOKEN, [], [true]],
      ["saas client default", SAAS_CLIENT_TOKEN, [SUBDOMAIN], [false]],
      ["saas client --decode", SAAS_CLIENT_TOKEN, [SUBDOMAIN], [true]],
    ])("%s", async (_, token, passArgs, passFlags) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token, expires_in: Infinity }),
      });
      const result = await uaa.uaaClient(contextMock, passArgs, passFlags);
      expect(fetchMock.mock.calls[0]).toMatchSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchSnapshot();
    });

    test.each([
      ["saas passcode default", SAAS_PASSCODE_TOKEN, [PASSCODE, SUBDOMAIN], [false, false], 1],
      ["saas passcode --decode", SAAS_PASSCODE_TOKEN, [PASSCODE, SUBDOMAIN], [true, false], 1],
      ["saas passcode --userinfo", SAAS_PASSCODE_TOKEN, [PASSCODE, SUBDOMAIN], [false, true], 2],
      ["saas passcode --decode --userinfo", SAAS_PASSCODE_TOKEN, [PASSCODE, SUBDOMAIN], [true, true], 2],
    ])("%s", async (_, token, passArgs, passFlags, fetchCalls) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token, expires_in: Infinity }),
      });
      if (fetchCalls > 1) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => uaaUserInfoMock,
        });
      }
      const result = await uaa.uaaPasscode(contextMock, passArgs, passFlags);
      expect(fetchMock.mock.calls).toMatchSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(fetchCalls);
      expect(result).toMatchSnapshot();
    });

    test.each([
      ["saas user default", SAAS_USER_TOKEN, [USERNAME, PASSWORD, SUBDOMAIN], [false, false], 1],
      ["saas user --decode", SAAS_USER_TOKEN, [USERNAME, PASSWORD, SUBDOMAIN], [true, false], 1],
      ["saas user --userinfo", SAAS_USER_TOKEN, [USERNAME, PASSWORD, SUBDOMAIN], [false, true], 2],
      ["saas user --decode --userinfo", SAAS_USER_TOKEN, [USERNAME, PASSWORD, SUBDOMAIN], [true, true], 2],
    ])("%s", async (_, token, passArgs, passFlags, fetchCalls) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token, expires_in: Infinity }),
      });
      if (fetchCalls > 1) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => uaaUserInfoMock,
        });
      }
      const result = await uaa.uaaUser(contextMock, passArgs, passFlags);
      expect(fetchMock.mock.calls).toMatchSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(fetchCalls);
      expect(result).toMatchSnapshot();
    });
  });

  describe("service tokens", () => {
    test.each([
      ["saas service client default", SAAS_SERVICE_CLIENT_TOKEN, [SERVICE, SUBDOMAIN], [false]],
      ["saas service client --decode", SAAS_SERVICE_CLIENT_TOKEN, [SERVICE, SUBDOMAIN], [true]],
    ])("%s", async (_, token, passArgs, passFlags) => {
      sharedStaticMock.isDashedWord.mockReturnValue(true);
      contextMock.getUaaInfo.mockReturnValueOnce({
        cfEnvApp: { application_name: APP_NAME },
        cfService: uaaCfServiceMock,
        cfEnvServices: { [SERVICE]: [{ credentials: cfEnvServicesMock }] },
      });
      contextMock.getCachedUaaTokenFromCredentials.mockReturnValueOnce(token);

      const result = await uaa.uaaServiceClient(contextMock, passArgs, passFlags);
      expect(contextMock.getUaaInfo).toHaveBeenCalledTimes(1);
      expect(result).toMatchSnapshot();
    });

    test.each([
      ["saas service passcode default", SAAS_SERVICE_PASSCODE_TOKEN, [SERVICE, PASSCODE, SUBDOMAIN], [false, false], 0],
      ["saas service passcode --decode", SAAS_SERVICE_PASSCODE_TOKEN, [SERVICE, PASSCODE, SUBDOMAIN], [true, false], 0],
      [
        "saas service passcode --userinfo",
        SAAS_SERVICE_PASSCODE_TOKEN,
        [SERVICE, PASSCODE, SUBDOMAIN],
        [false, true],
        1,
      ],
      [
        "saas service passcode --decode --userinfo",
        SAAS_SERVICE_PASSCODE_TOKEN,
        [SERVICE, PASSCODE, SUBDOMAIN],
        [true, true],
        1,
      ],
    ])("%s", async (_, token, passArgs, passFlags, fetchCalls) => {
      sharedStaticMock.isDashedWord.mockReturnValue(true);
      contextMock.getUaaInfo.mockReturnValueOnce({
        cfEnvApp: { application_name: APP_NAME },
        cfService: uaaCfServiceMock,
        cfEnvServices: { [SERVICE]: [{ credentials: cfEnvServicesMock }] },
      });
      contextMock.getCachedUaaTokenFromCredentials.mockReturnValueOnce(token);
      if (fetchCalls > 0) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => uaaUserInfoMock,
        });
      }
      const result = await uaa.uaaServicePasscode(contextMock, passArgs, passFlags);
      expect(fetchMock.mock.calls).toMatchSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(fetchCalls);
      expect(result).toMatchSnapshot();
    });

    test.each([
      [
        "saas service user default",
        SAAS_SERVICE_USER_TOKEN,
        [SERVICE, USERNAME, PASSWORD, SUBDOMAIN],
        [false, false],
        1,
      ],
      [
        "saas service user --decode",
        SAAS_SERVICE_USER_TOKEN,
        [SERVICE, USERNAME, PASSWORD, SUBDOMAIN],
        [true, false],
        1,
      ],
      [
        "saas service user --userinfo",
        SAAS_SERVICE_USER_TOKEN,
        [SERVICE, USERNAME, PASSWORD, SUBDOMAIN],
        [false, true],
        2,
      ],
      [
        "saas service user --decode --userinfo",
        SAAS_SERVICE_USER_TOKEN,
        [SERVICE, USERNAME, PASSWORD, SUBDOMAIN],
        [true, true],
        2,
      ],
    ])("%s", async (_, token, passArgs, passFlags, fetchCalls) => {
      sharedStaticMock.isDashedWord.mockReturnValue(true);
      contextMock.getUaaInfo.mockReturnValueOnce({
        cfEnvApp: { application_name: APP_NAME },
        cfService: uaaCfServiceMock,
        cfEnvServices: { service: [{ credentials: cfEnvServicesMock }] },
      });
      contextMock.getCachedUaaTokenFromCredentials.mockReturnValueOnce(SAAS_SERVICE_TOKEN);
      if (fetchCalls > 1) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => uaaUserInfoMock,
        });
      }
      const result = await uaa.uaaServiceUser(contextMock, passArgs, passFlags);
      expect(fetchMock.mock.calls).toMatchSnapshot();
      expect(fetchMock).toHaveBeenCalledTimes(fetchCalls);
      expect(result).toMatchSnapshot();
    });
  });
});
