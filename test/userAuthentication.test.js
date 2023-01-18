"use strict";

const fetchMock = require("node-fetch");
jest.mock("node-fetch");
const sharedStaticMock = require("../src/shared/static");
jest.mock("../src/shared/static", () => require("./__mocks/shared/static"));
const sharedErrorMock = require("../src/shared/error");
jest.mock("../src/shared/error", () => require("./__mocks/shared/error"));
const sharedOAuthMock = require("../src/shared/oauth");
jest.mock("../src/shared/oauth", () => require("./__mocks/shared/oauth"));

const uaa = require("../src/submodules/userAuthentication");

const SUBDOMAIN = "subdomain";
const PASSCODE = "passcode90";
const SERVICE = "service";
const PAAS_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoia2V5LWlkLTEiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NDlhYmVlZWFjYzY0OWY2OGFmNTg5Y2FmZTMzYTJjNiIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4ifSwic3ViIjoic2ItYWZjLWRldiF0NTg3NCIsImF1dGhvcml0aWVzIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sInNjb3BlIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sImNsaWVudF9pZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJjaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXpwIjoic2ItYWZjLWRldiF0NTg3NCIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJyZXZfc2lnIjoiYWI1OTRmNDMiLCJpYXQiOjE2MjE1MTQzNTksImV4cCI6MTYyMTU1NzU1OSwiaXNzIjoiaHR0cDovL3NreWZpbi5sb2NhbGhvc3Q6ODA4MC91YWEvb2F1dGgvdG9rZW4iLCJ6aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJhdWQiOlsidWFhIiwic2ItYWZjLWRldiF0NTg3NCIsImFmYy1kZXYhdDU4NzQiXX0.u5LbQ7T01RNOwovupuLqi2xv9Sq8QPizY1k9MB4iNTnE6PrEacVaYhZFjBGuqRU6RDjIdfB1drzSGm1MwtrRAYkwWthu9YAfgHVanujXpjkD6NOE6J4sMfmJoy7e9BewJwPZ6l8k6G_Jqnm-9vURMlzjXRXqr1UyAVxlcqc4ZMikVc-25_XvYJKgp_qnbX1kBUwxECeTWtIB80SbroCgbGMwKCck58JyLr2RrZ4ZEPApeE-rWXFGDPtpmECzPRRl2aptA2Nur3fdl5g8Sqih5i_sSmIWMeoeViMVAgbbTZ-graNzcWB8yHri8UNZVihcl5cRAXH9Gvw4kNcYhSxP-Q";
const SAAS_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI5OTQ0NmY2YzNmOWU0NWI1OTNhYWU0MDA0ODkwZjk3YSIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSJ9LCJzdWIiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXV0aG9yaXRpZXMiOlsidWFhLnJlc291cmNlIiwiYWZjLWRldiF0NTg3NC5tdGRlcGxveW1lbnQiLCJhZmMtZGV2IXQ1ODc0Lm10Y2FsbGJhY2siXSwic2NvcGUiOlsidWFhLnJlc291cmNlIiwiYWZjLWRldiF0NTg3NC5tdGRlcGxveW1lbnQiLCJhZmMtZGV2IXQ1ODc0Lm10Y2FsbGJhY2siXSwiY2xpZW50X2lkIjoic2ItYWZjLWRldiF0NTg3NCIsImNpZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJhenAiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiZ3JhbnRfdHlwZSI6ImNsaWVudF9jcmVkZW50aWFscyIsInJldl9zaWciOiI0ZDczMTQ4ZSIsImlhdCI6MTYyMTUxNTMyNiwiZXhwIjoxNjIxNTU4NTI2LCJpc3MiOiJodHRwczovL3NreWZpbi1jb21wYW55LmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS9vYXV0aC90b2tlbiIsInppZCI6IjVlY2M3NDEzLTJiN2UtNDE0YS05NDk2LWFkNGE2MWY2Y2NjZiIsImF1ZCI6WyJ1YWEiLCJzYi1hZmMtZGV2IXQ1ODc0IiwiYWZjLWRldiF0NTg3NCJdfQ.fp3nMFh0NvqGqMNXPyeY9SCQBVvXbi2MgV6p3nQ9X8YXUjT758E0q405FY3dWxo5pqwAk75MHdr-A_PpxM4X99CGsjKe5Jm_-BlVjLs0bYOMbfo-pSTKb9iPBY_8ACsA1dn8XTDBH8ZRLtaz00v0Hc1a6dbpsABiXp_H1HYs8Q93XghtqBJegs5YK8vxLsvPiWS8fZKm577QYtIpx6e4p9ThPIxY3c5BPPARRKhrwWlSYeRxwcWd3uhDeC3O_PSomAeUV21KJym4_tLB4Pw35rbnNhVyCy1SklL7FMXPkhbC6vmlF7_ID17yhY8hsaLIVrpTrVksgKmjNXqkOguaQw";
const PASSCODE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoia2V5LWlkLTEiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NWJiY2NlM2FmNDA0YmUxYWQzMzIyOGE5NjYwYTFlZCIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4ifSwieHMuc3lzdGVtLmF0dHJpYnV0ZXMiOnsieHMucm9sZWNvbGxlY3Rpb25zIjpbIkFGQ19BTEwiXX0sImdpdmVuX25hbWUiOiJSaWNoYXJkIiwieHMudXNlci5hdHRyaWJ1dGVzIjp7fSwiZmFtaWx5X25hbWUiOiJMaW5kbmVyIiwic3ViIjoiMDMxMDk4MjgtNjIwZS00ZTk2LWEzZmUtMTI4NWJiYWJmZWI4Iiwic2NvcGUiOlsiYWZjLWRldiF0NTg3NC5Qcm92aWRlciIsImFmYy1kZXYhdDU4NzQuQUZDX1N5c3RlbUFkbWluIiwiYWZjLWRldiF0NTg3NC5Db25zdW1lciIsImFmYy1kZXYhdDU4NzQuQUZDX1JlcG9ydGluZyIsImFmYy1kZXYhdDU4NzQuQUZDX1VzZXIiLCJvcGVuaWQiLCJ1YWEudXNlciIsImFmYy1kZXYhdDU4NzQuRXh0ZW5kQ0RTZGVsZXRlIiwiYWZjLWRldiF0NTg3NC5BRkNfRGVmaW5lIiwiYWZjLWRldiF0NTg3NC5LRVlVU0VSIiwiYWZjLWRldiF0NTg3NC5FeHRlbmRDRFMiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Vc2VyTWFuYWdlbWVudCIsImFmYy1kZXYhdDU4NzQuQUZDX0FwcHJvdmUiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db21wbGlhbmNlIiwiYWZjLWRldiF0NTg3NC5BRkNfUHJvY2VzcyIsImFmYy1kZXYhdDU4NzQuQUZDX0NvbmZpZyJdLCJjbGllbnRfaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiY2lkIjoic2ItYWZjLWRldiF0NTg3NCIsImF6cCI6InNiLWFmYy1kZXYhdDU4NzQiLCJncmFudF90eXBlIjoicGFzc3dvcmQiLCJ1c2VyX2lkIjoiMDMxMDk4MjgtNjIwZS00ZTk2LWEzZmUtMTI4NWJiYWJmZWI4Iiwib3JpZ2luIjoibGRhcCIsInVzZXJfbmFtZSI6InJpY2hhcmQubGluZG5lckBzYXAuY29tIiwiZW1haWwiOiJyaWNoYXJkLmxpbmRuZXJAc2FwLmNvbSIsInJldl9zaWciOiI5ZDdjNDRjNCIsImlhdCI6MTYyMTUxNjQ2MSwiZXhwIjoxNjIxNTU5NjYxLCJpc3MiOiJodHRwOi8vc2t5ZmluLmxvY2FsaG9zdDo4MDgwL3VhYS9vYXV0aC90b2tlbiIsInppZCI6IjdiMjA0MDhlLTNmZTAtNGFkZS1hYTJlLWFkOTdiYWFjNzJlOCIsImF1ZCI6WyJ1YWEiLCJvcGVuaWQiLCJzYi1hZmMtZGV2IXQ1ODc0IiwiYWZjLWRldiF0NTg3NCJdfQ.pJYyKHSYSnSMy2HIzb2Cp9IlXb0ntWj7tkcsuuI2mn3X4sHziuyUp_G8KemM9hLdh47bo-ZySoG_TaI5K0sHtULIOsH8g2lruNcyi9rzVpuRZE-M7WFPnrNuP85hZ5fKY0OGz4JAF9H9UHDtJk36cqXSV1UHUu2Rv0TaWDOW8GTY9wDfkPYEAVN7TQPyxTJN8GgpmtwOdaL_LgU3yECLEK7R3FY0xWV6JWCF526GQwDU-ZB_re3dKBzXDWdszXvNcaiN0f9zF8M1C2MBgop0LgUUQToqW0Zi5xEzBjYoVkZuMwtkHD54cPzLV5hp-XnuPryZUqWaYqhTYddCLOBgTA";
const SAAS_PASSCODE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NmJmMGYyODBiNzc0MTdiOTMxOTE3MTNmYWUwZGI2NSIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSJ9LCJ4cy5zeXN0ZW0uYXR0cmlidXRlcyI6eyJ4cy5yb2xlY29sbGVjdGlvbnMiOlsiQUZDX0FMTCJdfSwiZ2l2ZW5fbmFtZSI6IlJpY2hhcmQiLCJ4cy51c2VyLmF0dHJpYnV0ZXMiOnt9LCJmYW1pbHlfbmFtZSI6IkxpbmRuZXIiLCJzdWIiOiJhOGEzN2FiNy0wMDU2LTRkNGItYjNkNy1mNzBlYWQ5MmM4MjkiLCJzY29wZSI6WyJhZmMtZGV2IXQ1ODc0LlByb3ZpZGVyIiwiYWZjLWRldiF0NTg3NC5Db25zdW1lciIsImFmYy1kZXYhdDU4NzQuQUZDX1JlcG9ydGluZyIsImFmYy1kZXYhdDU4NzQuQUZDX1VzZXIiLCJvcGVuaWQiLCJhZmMtZGV2IXQ1ODc0LkV4dGVuZENEU2RlbGV0ZSIsImFmYy1kZXYhdDU4NzQuS0VZVVNFUiIsImFmYy1kZXYhdDU4NzQuRXh0ZW5kQ0RTIiwiYWZjLWRldiF0NTg3NC5BRkNfQXBwcm92ZSIsImFmYy1kZXYhdDU4NzQuQUZDX1Byb2Nlc3MiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db25maWciLCJhZmMtZGV2IXQ1ODc0LkFGQ19TeXN0ZW1BZG1pbiIsInVhYS51c2VyIiwiYWZjLWRldiF0NTg3NC5BRkNfRGVmaW5lIiwiYWZjLWRldiF0NTg3NC5BRkNfVXNlck1hbmFnZW1lbnQiLCJhZmMtZGV2IXQ1ODc0LkFGQ19Db21wbGlhbmNlIl0sImNsaWVudF9pZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJjaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXpwIjoic2ItYWZjLWRldiF0NTg3NCIsImdyYW50X3R5cGUiOiJwYXNzd29yZCIsInVzZXJfaWQiOiJhOGEzN2FiNy0wMDU2LTRkNGItYjNkNy1mNzBlYWQ5MmM4MjkiLCJvcmlnaW4iOiJzYXAuZGVmYXVsdCIsInVzZXJfbmFtZSI6InJpY2hhcmQubGluZG5lckBzYXAuY29tIiwiZW1haWwiOiJyaWNoYXJkLmxpbmRuZXJAc2FwLmNvbSIsInJldl9zaWciOiI1NzRmMDc1IiwiaWF0IjoxNjIxNTE2NTkzLCJleHAiOjE2MjE1NTk3OTMsImlzcyI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL29hdXRoL3Rva2VuIiwiemlkIjoiNWVjYzc0MTMtMmI3ZS00MTRhLTk0OTYtYWQ0YTYxZjZjY2NmIiwiYXVkIjpbInVhYSIsIm9wZW5pZCIsInNiLWFmYy1kZXYhdDU4NzQiLCJhZmMtZGV2IXQ1ODc0Il19.o-hXO2NWSaG3PQRfVdOVL93LoY2SJZ-grl2WLuY2UA94D09Obvg32EB-0yNwtfdEJb-eR2vkrwSh64n0J1u8b7JCPl_9ddQysXb_NsoUvxQXmi9kpTKwD6nQTwFc6mYz8dn4UeERkAbMWFHhF16iDRwmPT5v9l_57u-YRSUjW9azgB5Lf8X9NBzk0N94f_FWtZNnNNe_eK0uTkx8QP2T3w2fLtsSX2HMg4W5DCRaf-67XezHPOMYfcSz0rIb18dBSl6h9_nirl-Tjm8RcINytZLsQNA_iuZ18vvjJloTvmrdDMgh7EI70R3oCoaGovvagKg7WwXs3QFTqj6xj6ilNg";
const SAAS_SERVICE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLWNvbXBhbnkuYXV0aGVudGljYXRpb24uc2FwLmhhbmEub25kZW1hbmQuY29tL3Rva2VuX2tleXMiLCJraWQiOiJkZWZhdWx0LWp3dC1rZXktLTEyNDY1MTM5OTAiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiJjMDZhODgxZjQzZDU0NDFhOTBjY2NhYmFjZWZmZmY4YyIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI1ZWNjNzQxMy0yYjdlLTQxNGEtOTQ5Ni1hZDRhNjFmNmNjY2YiLCJ6ZG4iOiJza3lmaW4tY29tcGFueSIsInNlcnZpY2VpbnN0YW5jZWlkIjoiYWZiNzIyZmItMTFjYS00ZmUyLWE0MzQtOWE3MTcyZGU5MmMzIn0sInN1YiI6InNiLWFmYjcyMmZiLTExY2EtNGZlMi1hNDM0LTlhNzE3MmRlOTJjMyFiNTg3NHxuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMiLCJhdXRob3JpdGllcyI6WyJuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMuQVBJTWFuYWdlIiwieGZzcnQtYXBwbGljYXRpb24hdDgyMjMuQ2FsbGJhY2siLCJuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMuT0RQTWFuYWdlIiwidWFhLnJlc291cmNlIiwibmEtOWFiODM0YzItYmMxMS00N2ExLWI4Y2ItZDgzZDdhNWE1Nzc0IWI4MjIzLkFQSUZ1bGxBY2Nlc3MiLCJuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMuT0RQQVBJQWNjZXNzIl0sInNjb3BlIjpbIm5hLTlhYjgzNGMyLWJjMTEtNDdhMS1iOGNiLWQ4M2Q3YTVhNTc3NCFiODIyMy5PRFBNYW5hZ2UiLCJ1YWEucmVzb3VyY2UiLCJuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMuQVBJRnVsbEFjY2VzcyIsIm5hLTlhYjgzNGMyLWJjMTEtNDdhMS1iOGNiLWQ4M2Q3YTVhNTc3NCFiODIyMy5BUElNYW5hZ2UiLCJ4ZnNydC1hcHBsaWNhdGlvbiF0ODIyMy5DYWxsYmFjayIsIm5hLTlhYjgzNGMyLWJjMTEtNDdhMS1iOGNiLWQ4M2Q3YTVhNTc3NCFiODIyMy5PRFBBUElBY2Nlc3MiXSwiY2xpZW50X2lkIjoic2ItYWZiNzIyZmItMTFjYS00ZmUyLWE0MzQtOWE3MTcyZGU5MmMzIWI1ODc0fG5hLTlhYjgzNGMyLWJjMTEtNDdhMS1iOGNiLWQ4M2Q3YTVhNTc3NCFiODIyMyIsImNpZCI6InNiLWFmYjcyMmZiLTExY2EtNGZlMi1hNDM0LTlhNzE3MmRlOTJjMyFiNTg3NHxuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMiLCJhenAiOiJzYi1hZmI3MjJmYi0xMWNhLTRmZTItYTQzNC05YTcxNzJkZTkyYzMhYjU4NzR8bmEtOWFiODM0YzItYmMxMS00N2ExLWI4Y2ItZDgzZDdhNWE1Nzc0IWI4MjIzIiwiZ3JhbnRfdHlwZSI6ImNsaWVudF9jcmVkZW50aWFscyIsInJldl9zaWciOiI3ZWY4MzlmNCIsImlhdCI6MTYyMTUxNjY1NiwiZXhwIjoxNjIxNTU5ODU2LCJpc3MiOiJodHRwczovL3NreWZpbi1jb21wYW55LmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS9vYXV0aC90b2tlbiIsInppZCI6IjVlY2M3NDEzLTJiN2UtNDE0YS05NDk2LWFkNGE2MWY2Y2NjZiIsImF1ZCI6WyJzYi1hZmI3MjJmYi0xMWNhLTRmZTItYTQzNC05YTcxNzJkZTkyYzMhYjU4NzR8bmEtOWFiODM0YzItYmMxMS00N2ExLWI4Y2ItZDgzZDdhNWE1Nzc0IWI4MjIzIiwidWFhIiwieGZzcnQtYXBwbGljYXRpb24hdDgyMjMiLCJuYS05YWI4MzRjMi1iYzExLTQ3YTEtYjhjYi1kODNkN2E1YTU3NzQhYjgyMjMiXX0.nCFyjFO9aIFqS2l5x9oi9t1knxhjxPrqmg-8lSjROCS1xXFF95ETEdGJGnz_a_xUldK278ajArtEicjpcIUL_AaUzR2VCgH6lJMz7yeGZPGWtn2zizVt59S35cfD0WqQPJ39J7kbI1qrz3WwJKwPUmwg7uej9tfWin_uHxK7Yp4EVwhMzw_iiygGsn_VHX2w4TV6bXperG_Xez5lxqzCOudLGPWqmbnxOTB_Q2RlKIJkAJhdYVgArkJWu5rtCOCmVu-eA-RcQVe_LPevTJpFSonCPyCYCP9UMFnAvJheGXbE0AkRoFjffyebU5e6k8Q384iXjTSPGVUNw6bkD68AXQ";

const uaaCfServiceMock = {
  credentials: {
    url: "https://identityzone.authentication",
    identityzone: "identityzone",
    clientid: "clientid",
    clientsecret: "clientsecret",
  },
};

const contextMock = {
  getUaaInfo: jest.fn(),
  getUaaToken: jest.fn((options) => {
    return sharedOAuthMock.getUaaTokenFromCredentials(uaaCfServiceMock.credentials, options);
  }),
};

describe("uaa tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("uaaDecode", async () => {
    const result = await uaa.uaaDecode([PAAS_TOKEN]);
    expect(sharedStaticMock.isJWT).toHaveBeenCalledTimes(1);
    expect(sharedStaticMock.isJWT).toHaveBeenCalledWith(PAAS_TOKEN);
    expect(result).toMatchSnapshot();
  });

  test("uaaClient without tenant", async () => {
    const commonPrepares = () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: PAAS_TOKEN }) });
    };
    const commonAsserts = () => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]).toMatchSnapshot();
    };

    commonPrepares();
    const result1 = await uaa.uaaClient(contextMock, [], [false]);
    commonAsserts();
    expect(result1).toMatchSnapshot();

    jest.clearAllMocks();
    commonPrepares();
    const result2 = await uaa.uaaClient(contextMock, [], [true]);
    commonAsserts();
    expect(result2).toMatchSnapshot();
  });

  test("uaaClient with tenant", async () => {
    const commonPrepares = () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: SAAS_TOKEN }) });
    };
    const commonAsserts = () => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]).toMatchSnapshot();
    };
    commonPrepares();
    const result1 = await uaa.uaaClient(contextMock, [SUBDOMAIN], [false]);
    commonAsserts();
    expect(result1).toMatchSnapshot();

    jest.clearAllMocks();
    commonPrepares();
    const result2 = await uaa.uaaClient(contextMock, [SUBDOMAIN], [true]);
    commonAsserts();
    expect(result2).toMatchSnapshot();
  });

  test("uaaPasscode without tenant", async () => {
    const commonPrepares = () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: PASSCODE_TOKEN }) });
    };
    const commonAsserts = () => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]).toMatchSnapshot();
    };
    commonPrepares();
    const result1 = await uaa.uaaPasscode(contextMock, [PASSCODE], [false]);
    commonAsserts();
    expect(result1).toMatchSnapshot();

    jest.clearAllMocks();
    commonPrepares();
    const result2 = await uaa.uaaPasscode(contextMock, [PASSCODE], [true]);
    commonAsserts();
    expect(result2).toMatchSnapshot();
  });

  test("uaaPasscode with tenant", async () => {
    const commonPrepares = () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: SAAS_PASSCODE_TOKEN }) });
    };
    const commonAsserts = () => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]).toMatchSnapshot();
    };
    commonPrepares();
    const result1 = await uaa.uaaPasscode(contextMock, [PASSCODE, SUBDOMAIN], [false]);
    commonAsserts();
    expect(result1).toMatchSnapshot();

    jest.clearAllMocks();
    commonPrepares();
    const result2 = await uaa.uaaPasscode(contextMock, [PASSCODE, SUBDOMAIN], [true]);
    commonAsserts();
    expect(result2).toMatchSnapshot();
  });

  test("uaaService with tenant", async () => {
    const cfEnvServicesMock = {
      url: "serviceurl",
      clientid: "serviceclientid",
      clientsecret: "serviceclientsecret",
    };
    const commonPrepares = () => {
      sharedStaticMock.isDashedWord.mockReturnValue(true);
      contextMock.getUaaInfo.mockReturnValueOnce({
        cfEnvApp: { application_name: "appname" },
        cfService: uaaCfServiceMock,
        cfEnvServices: { service: [{ credentials: cfEnvServicesMock }] },
      });
      sharedOAuthMock.getUaaTokenFromCredentials.mockReturnValueOnce(SAAS_SERVICE_TOKEN);
    };
    const commonAsserts = () => {
      expect(sharedStaticMock.isDashedWord).toHaveBeenCalledTimes(1);
      expect(sharedStaticMock.isDashedWord).toHaveBeenNthCalledWith(1, SERVICE);
      expect(sharedErrorMock.assert).toHaveBeenCalledTimes(2);
      expect(sharedErrorMock.assert).toHaveBeenNthCalledWith(1, true, expect.anything());
      expect(sharedErrorMock.assert).toHaveBeenNthCalledWith(
        2,
        cfEnvServicesMock,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(sharedOAuthMock.getUaaTokenFromCredentials).toHaveBeenCalledTimes(1);
      expect(sharedOAuthMock.getUaaTokenFromCredentials).toHaveBeenCalledWith(
        {
          url: "serviceurl",
          clientid: "serviceclientid",
          clientsecret: "serviceclientsecret",
        },
        { subdomain: "subdomain" }
      );
    };
    commonPrepares();
    const result1 = await uaa.uaaService(contextMock, [SERVICE, SUBDOMAIN], [false]);
    commonAsserts();
    expect(result1).toMatchSnapshot();

    jest.clearAllMocks();
    commonPrepares();
    const result2 = await uaa.uaaService(contextMock, [SERVICE, SUBDOMAIN], [true]);
    commonAsserts();
    expect(result2).toMatchSnapshot();
  });
});
