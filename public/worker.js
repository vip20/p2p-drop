let array = [];
self.addEventListener("message", (event) => {
  if (array && array.length > 0 && event.data === "download") {
    const blob = new Blob(array);
    self.postMessage(blob);
    array = [];
  } else {
    array.push(event.data);
  }
});
