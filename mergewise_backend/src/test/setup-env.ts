process.env.NODE_ENV = "test";
// Keep tests hermetic: src/env.ts runs dotenv/config, which would otherwise
// load a developer's real .env (live Redis, OpenAI key, ...) over these defaults.
process.env.DOTENV_CONFIG_PATH = "nonexistent.env";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-real-use";
process.env.GITHUB_OAUTH_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_OAUTH_CLIENT_SECRET ??= "test-client-secret";
process.env.GITHUB_APP_SLUG ??= "test-app";
process.env.GITHUB_APP_ID ??= "123456";
process.env.GITHUB_WEBHOOK_SECRET ??= "test-webhook-secret";
// A throwaway RSA key generated solely for signing test JWTs — never used
// against a real GitHub App.
process.env.GITHUB_APP_PRIVATE_KEY ??=
  "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCU563J14YyanRu\nqINzwFySQHkv+hJOu0dmB/wtc80WHbWteesJyPQVeyqCDOg4ajwYs1zLuOcHDVQH\nPsHnhwJwFDXnNkEr4ReroMtd4pvz8J7Fg+MhG6q6N+xnpoSzIFJyhzJO16Ty8X4c\ncKEi1L4lcTPJyWaMG43E/W8BdDm1nV8efNPOTeBuOt34Wow/AuH4JmruiS1COyBt\nr+JFsPjttOWWT/R88Ais3nvWxbHFSkKrhk2sv2bo1xkHuxcXDjfMkmn8VqNZIQB4\ns/ULCBUrLDOkOX4lu3a5UJsjVgantLFGmNpvIjsnR9fg09Mub6hWNoeZby/5uMFa\nvfef/Jr/AgMBAAECggEALCO9NX7o7dr2prLXPKHCDyyDgABOGv6S/KDTVRnlqm+m\nIkVosd7a099Ny31N/SMoq13H3S/zc/i0du1Yh2xTAaxMCjzf9sTjwmGIx0zcU+R4\n/C3LT04nPspDDrqizYKATijbddmgsM97RazxZyTPNMQoyOElv9SPItzJYhH05WvM\nOTidEJGB5orYaMqzNp6R04Lg2Mtxyoxv+xiOqyYOWahBuvp9USnrFaTjNhaXZXvQ\nsVkd8E7cNrskI4sJq+52/+cQvZjIOtPF3A5XcUzggnjiGlOKiyXr5Esty5SjYEL9\nhMB3TimK/jPdVQr1vqolQCOewdxkwdoO8i8ABblBgQKBgQDGUNlp/W5q8Ocpzfo8\nMB21/mILbVYUP5wJ81Qy3zw+dp/FEbTQ0lRw1wMa6Mi2UzojC2S33Ekl1tW0f4Wz\nR1a95sgPrH/Pikh1goS35d3jKIEk7OhZgrkLHFoEiM5MvrTvhLKdaICSXF0VyYYg\nUuo69ZVV92eyPE7mi/qyd0Q6vwKBgQDAN4+/qkgRuMYw2y2DZMasT4RnktqJdEmw\nvYe245EvbskuBZkXyO0bJ8F117vkWCc1UEcfzcofUJtz95UwEEjq4+D7ulwHN/1J\nMeBJINagPGTQSpSj4hWNuhkL36rAr0ovvZPMiL+cHoRmtL6vh04VLSxPfKSBrT9B\nIMfM7kzvwQKBgQC9yE9Xk/UgGCxQIFLxWGaGbMts/hQbSohMKXWRPXrMl/7ru7cb\nA71VQx4wmUbC3MDNGrEnFoNV19MpacQMPh/vmbQo875YYZBYDDBwQGVoZrG4IZN1\nXZkx3c7zeexbG0HR2V6JLqGj7woRuIpH0rFe/PgNjbbJpdcn4BtowKQlxwKBgQCR\nIyLymRPz9a4Iw+Z42QY+o4gZYMSMl3bw8htgmDJPO3rCuk1frUKDh6BHZ88i2wE3\n+1bJB+0/efD3PpGyiglU+x4tVQkaFke1FekBrr8AnLmOoVHc8OBPdJ5m3csj1PfS\nVnYcMYFk05Irrvxws1zdFo/nsPjSRcuGVMco0SLcwQKBgHvJk+RM1jEwl/QqxboE\nJR0LGCKRc/ZyVsLyuzT6n0vm54TYnfT0p+fPT2KVK1MSuguyP+ExN/2Hvsgohx88\nfCAOV+zwKSNei3t10gmlCGZqFI3+LX2aMHsE5zK/fmgQN1JEEWQo6M8B2i6/Fo0W\nFI3zU8rGaa9uKrmwmA2GfOuJ\n-----END PRIVATE KEY-----\n";
process.env.API_BASE_URL ??= "http://localhost:3000";
process.env.WEB_BASE_URL ??= "http://localhost:5173";
