"use strict";
const { LazyCache } = require("../../src/shared/cache");

let cache;
describe("lazy cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("custom separator", async () => {
    const customSeparator = "--";
    cache = new LazyCache({ separator: customSeparator });
    cache.set(["a", "b", "c"], "abc");
    expect(Object.keys(cache._data()).includes(["a", "b", "c"].join(customSeparator))).toBe(true);
  });

  describe("with default options", () => {
    beforeEach(() => {
      cache = new LazyCache();
    });

    it("has/get/set/setCb/setCbAsync", async () => {
      cache.set("", "empty");
      cache.set("a", "a");
      cache.set("b", "b");
      cache.set("c", "c");
      cache.set(["a", "b"], "ab");
      cache.set(["a", "b", "c"], "abc");
      cache.setCb("a with cb", () => "a with cb");
      cache.setCb("b with cb", (b) => b, "b with cb");
      cache.setCb("c with cb", (b, c) => b + c, "c", " with cb");
      await cache.setCb("a with cbA", async () => "a with cbA");
      await cache.setCb("b with cbA", async (b) => b, "b with cbA");
      await cache.setCb("c with cbA", async (b, c) => b + c, "c", " with cbA");

      expect(cache.set("d", "d")).toBe(cache);

      expect(cache.has("a")).toBe(true);
      expect(cache.has(["a"])).toBe(true);
      expect(cache.has("z")).toBe(false);
      expect(cache.has(["z"])).toBe(false);

      expect(cache.get("")).toBe("empty");
      expect(cache.get([])).toBe("empty");
      expect(cache.get("a")).toBe("a");
      expect(cache.get("b")).toBe("b");
      expect(cache.get("c")).toBe("c");
      expect(cache.get(["a", "b"])).toBe("ab");
      expect(cache.get(["a", "b", "c"])).toBe("abc");

      expect(cache.get("a with cb")).toBe("a with cb");
      expect(cache.get("b with cb")).toBe("b with cb");
      expect(cache.get("c with cb")).toBe("c with cb");
      expect(await cache.get("a with cbA")).toBe("a with cbA");
      expect(await cache.get("b with cbA")).toBe("b with cbA");
      expect(await cache.get("c with cbA")).toBe("c with cbA");

      expect(
        await Object.entries(cache._data()).reduce(async (result, [key, value]) => {
          (await result)[key] = await value;
          return result;
        }, Promise.resolve({}))
      ).toMatchInlineSnapshot(`
        {
          "": "empty",
          "a": "a",
          "a with cb": "a with cb",
          "a with cbA": "a with cbA",
          "a##b": "ab",
          "a##b##c": "abc",
          "b": "b",
          "b with cb": "b with cb",
          "b with cbA": "b with cbA",
          "c": "c",
          "c with cb": "c with cb",
          "c with cbA": "c with cbA",
          "d": "d",
        }
      `);
    });

    it("getSetCb/getSetCbAsync", async () => {
      const cbSpy = jest.fn((a) => a);
      const cbAsyncSpy = jest.fn(async (a) => a);

      for (let i = 0; i < 10; i++) {
        expect(cache.getSetCb("a", cbSpy, "a result")).toBe("a result");
        expect(await cache.getSetCb("b", cbAsyncSpy, "b result")).toBe("b result");
      }
      expect(cbSpy).toHaveBeenCalledTimes(1);
      expect(cbAsyncSpy).toHaveBeenCalledTimes(1);

      expect(
        await Object.entries(cache._data()).reduce(async (result, [key, value]) => {
          (await result)[key] = await value;
          return result;
        }, Promise.resolve({}))
      ).toMatchInlineSnapshot(`
        {
          "a": "a result",
          "b": "b result",
        }
      `);
    });

    it("count/delete/clear", async () => {
      const n = 10;
      const values = Array.from(Array(n).keys()).map((i) => String.fromCharCode(i + "a".charCodeAt(0)));
      values.forEach((value) => cache.set(value, value));

      expect(cache.count()).toBe(n);
      cache.delete("a");
      expect(cache.count()).toBe(n - 1);
      cache.delete("a");
      expect(cache.count()).toBe(n - 1);
      cache.delete("b");
      expect(cache.count()).toBe(n - 2);
      cache.delete("b");
      expect(cache.count()).toBe(n - 2);

      cache.clear();
      expect(cache.count()).toBe(0);
    });

    test("getSetCb with async callbacks", async () => {
      const firstCaller = jest.fn(async () => {});
      const secondCaller = jest.fn(async () => {});
      const thirdCaller = jest.fn(async () => {});
      await Promise.all([
        cache.getSetCb("key", firstCaller),
        cache.getSetCb("key", secondCaller),
        cache.getSetCb("key", thirdCaller),
      ]);
      expect(firstCaller).toHaveBeenCalledTimes(1);
      expect(secondCaller).toHaveBeenCalledTimes(0);
      expect(thirdCaller).toHaveBeenCalledTimes(0);
    });
  });
});
