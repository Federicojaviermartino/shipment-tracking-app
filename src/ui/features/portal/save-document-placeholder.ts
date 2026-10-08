type DocumentPlaceholder = {
  label: string;
  fileName: string;
  orderRef: string;
};

/**
 * Documents are metadata in this prototype: there is no file behind one. The download is real
 * all the same, and what it saves says plainly what it stands in for.
 */
export function saveDocumentPlaceholder({ label, fileName, orderRef }: DocumentPlaceholder) {
  const text = [
    `${label} · order ${orderRef}`,
    `File: ${fileName}`,
    "",
    "This is a synthetic placeholder for that document.",
    "Estela is a prototype: it keeps the name and the date of each document, not the file itself.",
    "",
  ].join("\n");

  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  // The content is text, so the saved file says so instead of posing as the original format.
  link.download = `${fileName}.txt`;
  link.click();
  // Released on the next task: the browser has taken the download by then.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
