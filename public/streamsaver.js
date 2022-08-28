/**
 * Minified by jsDelivr using Terser v5.10.0.
 * Original file: /npm/streamsaver@2.0.6/StreamSaver.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
/*! streamsaver. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
((e, t) => {
  "undefined" != typeof module
    ? (module.exports = t())
    : "function" == typeof define && "object" == typeof define.amd
    ? define(t)
    : (this.streamSaver = t());
})(0, () => {
  "use strict";
  const e = "object" == typeof window ? window : this;
  e.HTMLElement ||
    console.warn("streamsaver is meant to run on browsers main thread");
  let t = null,
    a = !1;
  const r = e.WebStreamsPolyfill || {},
    n = e.isSecureContext;
  let o = /constructor/i.test(e.HTMLElement) || !!e.safari || !!e.WebKitPoint;
  const s =
      n || "MozAppearance" in document.documentElement.style
        ? "iframe"
        : "navigate",
    i = {
      createWriteStream: function (r, m, c) {
        let d = {
            size: null,
            pathname: null,
            writableStrategy: void 0,
            readableStrategy: void 0,
          },
          p = 0,
          u = null,
          f = null,
          g = null;
        Number.isFinite(m)
          ? (([c, m] = [m, c]),
            console.warn(
              "[StreamSaver] Deprecated pass an object as 2nd argument when creating a write stream"
            ),
            (d.size = c),
            (d.writableStrategy = m))
          : m && m.highWaterMark
          ? (console.warn(
              "[StreamSaver] Deprecated pass an object as 2nd argument when creating a write stream"
            ),
            (d.size = c),
            (d.writableStrategy = m))
          : (d = m || {});
        if (!o) {
          t ||
            (t = n
              ? l(i.mitm)
              : (function (t) {
                  const a = "width=200,height=100",
                    r = document.createDocumentFragment(),
                    n = {
                      frame: e.open(t, "popup", a),
                      loaded: !1,
                      isIframe: !1,
                      isPopup: !0,
                      remove() {
                        n.frame.close();
                      },
                      addEventListener(...e) {
                        r.addEventListener(...e);
                      },
                      dispatchEvent(...e) {
                        r.dispatchEvent(...e);
                      },
                      removeEventListener(...e) {
                        r.removeEventListener(...e);
                      },
                      postMessage(...e) {
                        n.frame.postMessage(...e);
                      },
                    },
                    o = (t) => {
                      t.source === n.frame &&
                        ((n.loaded = !0),
                        e.removeEventListener("message", o),
                        n.dispatchEvent(new Event("load")));
                    };
                  return e.addEventListener("message", o), n;
                })(i.mitm)),
            (f = new MessageChannel()),
            (r = encodeURIComponent(r.replace(/\//g, ":"))
              .replace(/['()]/g, escape)
              .replace(/\*/g, "%2A"));
          const o = {
            transferringReadable: a,
            pathname:
              d.pathname || Math.random().toString().slice(-6) + "/" + r,
            headers: {
              "Content-Type": "application/octet-stream; charset=utf-8",
              "Content-Disposition": "attachment; filename*=UTF-8''" + r,
            },
          };
          d.size && (o.headers["Content-Length"] = d.size);
          const m = [o, "*", [f.port2]];
          if (a) {
            const e =
              "iframe" === s
                ? void 0
                : {
                    transform(e, t) {
                      if (!(e instanceof Uint8Array))
                        throw new TypeError("Can only write Uint8Arrays");
                      (p += e.length),
                        t.enqueue(e),
                        u && ((location.href = u), (u = null));
                    },
                    flush() {
                      u && (location.href = u);
                    },
                  };
            g = new i.TransformStream(
              e,
              d.writableStrategy,
              d.readableStrategy
            );
            const t = g.readable;
            f.port1.postMessage({ readableStream: t }, [t]);
          }
          (f.port1.onmessage = (e) => {
            e.data.download
              ? "navigate" === s
                ? (t.remove(),
                  (t = null),
                  p ? (location.href = e.data.download) : (u = e.data.download))
                : (t.isPopup &&
                    (t.remove(), (t = null), "iframe" === s && l(i.mitm)),
                  l(e.data.download))
              : e.data.abort &&
                ((h = []),
                f.port1.postMessage("abort"),
                (f.port1.onmessage = null),
                f.port1.close(),
                f.port2.close(),
                (f = null));
          }),
            t.loaded
              ? t.postMessage(...m)
              : t.addEventListener(
                  "load",
                  () => {
                    t.postMessage(...m);
                  },
                  { once: !0 }
                );
        }
        let h = [];
        return (
          (!o && g && g.writable) ||
          new i.WritableStream(
            {
              write(e) {
                if (!(e instanceof Uint8Array))
                  throw new TypeError("Can only write Uint8Arrays");
                o
                  ? h.push(e)
                  : (f.port1.postMessage(e),
                    (p += e.length),
                    u && ((location.href = u), (u = null)));
              },
              close() {
                if (o) {
                  const e = new Blob(h, {
                      type: "application/octet-stream; charset=utf-8",
                    }),
                    t = document.createElement("a");
                  (t.href = URL.createObjectURL(e)),
                    (t.download = r),
                    t.click();
                } else f.port1.postMessage("end");
              },
              abort() {
                (h = []),
                  f.port1.postMessage("abort"),
                  (f.port1.onmessage = null),
                  f.port1.close(),
                  f.port2.close(),
                  (f = null);
              },
            },
            d.writableStrategy
          )
        );
      },
      WritableStream: e.WritableStream || r.WritableStream,
      supported: !0,
      version: { full: "2.0.5", major: 2, minor: 0, dot: 5 },
      mitm: "https://jimmywarting.github.io/StreamSaver.js/mitm.html?version=2.0.0",
    };
  function l(e) {
    if (!e) throw new Error("meh");
    const t = document.createElement("iframe");
    return (
      (t.hidden = !0),
      (t.src = e),
      (t.loaded = !1),
      (t.name = "iframe"),
      (t.isIframe = !0),
      (t.postMessage = (...e) => t.contentWindow.postMessage(...e)),
      t.addEventListener(
        "load",
        () => {
          t.loaded = !0;
        },
        { once: !0 }
      ),
      document.body.appendChild(t),
      t
    );
  }
  try {
    new Response(new ReadableStream()),
      n && !("serviceWorker" in navigator) && (o = !0);
  } catch (e) {
    o = !0;
  }
  return (
    ((e) => {
      try {
        e();
      } catch (e) {}
    })(() => {
      const { readable: e } = new TransformStream(),
        t = new MessageChannel();
      t.port1.postMessage(e, [e]),
        t.port1.close(),
        t.port2.close(),
        (a = !0),
        Object.defineProperty(i, "TransformStream", {
          configurable: !1,
          writable: !1,
          value: TransformStream,
        });
    }),
    i
  );
});
//# sourceMappingURL=/sm/a47e90c9e77f79e22405531b2deda4d299dc4ffb8262b6b5b3af3580ec770db0.map
