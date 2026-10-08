import { expect, test, type Page } from "@playwright/test";

async function switchPersona(page: Page, name: string) {
  await page.getByRole("button", { name: /Viewing as/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(name) }).click();
}

async function sendOperatorEvent(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).click();
}

// A toast is also announced through a live region, so its words are on the page twice.
async function expectToast(page: Page, text: RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}

async function ask(page: Page, question: string) {
  const bar = page.getByRole("combobox", { name: "Ask about your shipments" });
  await bar.fill(question);
  await bar.press("Enter");
}

test("the demo flow: from an operator event to a customer who hears it first", async ({ page }) => {
  // One long story on purpose: each step depends on what the previous one left in the world.
  test.setTimeout(120_000);

  await test.step("the queue opens ranked by clock, not by severity", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ops$/);
    await expect(page.getByRole("tab", { name: /Needs attention/ })).toContainText("6");
    await expect(page.getByRole("row").nth(1)).toContainText("EST-4128");
    await expect(page.getByText(/Where acting today changes the outcome/)).toBeVisible();
  });

  await test.step("one vessel event reaches two shipments and opens one case", async () => {
    await sendOperatorEvent(page, /Send: Noray Lines/);
    await expectToast(page, /2 shipments affected, 1 needs a customer notice/);
    await expect(page.getByRole("tab", { name: /Needs attention/ })).toContainText("7");
  });

  await test.step("order 12345 shows three dates and makes no claim to the customer", async () => {
    await page.getByRole("link", { name: "EST-4058" }).click();
    await expect(
      page.getByRole("heading", { name: /At risk: estimate one day after the committed date/ }),
    ).toBeVisible();
    await expect(page.getByText(/before the vessel delay/).first()).toBeVisible();
    await expect(page.getByText("Delivery date under review (was Wed 14 Oct)")).toBeVisible();
  });

  await test.step("the notice is reviewed, guarded against invented dates, and approved", async () => {
    await page.getByRole("button", { name: "Review notice" }).click();
    const message = page.getByRole("textbox", { name: "Message" });
    await expect(message).toHaveValue(/Fri 16 Oct/);
    const draft = await message.inputValue();

    await message.fill(`${draft} Please move it to Sun 18 Oct.`);
    await expect(page.getByText(/This date is not in the shipment record: 18 Oct/)).toBeVisible();

    await message.fill(`${draft} We are sorry for the change.`);
    await page.getByRole("button", { name: "Approve and send" }).click();
    await expectToast(page, /Notice sent/);
  });

  await test.step("the customer sees the verdict and the signed notice, and nothing else", async () => {
    await switchPersona(page, "Mariana Olvera");
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText("Order 12345: new delivery estimate, Fri 16 Oct")).toBeVisible();
    await expect(page.getByText(/We are sorry for the change/)).toBeVisible();
    await expect(page.getByText(/Approved by Marta Soler/)).toBeVisible();

    await page.getByRole("link", { name: /See shipment/ }).click();
    await expect(page).toHaveURL(/\/portal\/shipments\/EST-4058$/);
    await expect(
      page.getByText("Estimated by Ibón logistics, approved by Marta Soler"),
    ).toBeVisible();
    await expect(page.getByText(/Show original/)).toHaveCount(0);
  });

  await test.step("when the forwarder confirms, the same date changes its provenance", async () => {
    await sendOperatorEvent(page, /Send: Turia Global Forwarding · confirms/);
    await expect(page.getByText("Estimated by the carrier").first()).toBeVisible();

    await switchPersona(page, "Marta Soler");
    await page.getByRole("tab", { name: /^All/ }).click();
    await page.getByRole("link", { name: "EST-4058" }).click();
    await expect(page.getByRole("button", { name: "Review notice" })).toHaveCount(0);
    await expect(page.getByText(/Your part is done/)).toBeVisible();
  });

  await test.step("a customs hold read from an email is confirmed, acted on and resolved", async () => {
    await page.goto("/ops/shipments/EST-4012");
    await page.getByRole("button", { name: "Confirm reading" }).first().click();
    await expect(page.getByText(/confirmed by Marta Soler/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Send invoice" }).click();
    await page.getByRole("button", { name: /Use the sample file/ }).click();
    await page.getByRole("button", { name: "Approve and send" }).click();
    await expect(page.getByRole("button", { name: "Send invoice" })).toHaveCount(0);

    await sendOperatorEvent(page, /Send: Turia Global Forwarding · customs release/);
    await expectToast(page, /Resolved by operator update: EST-4012/);
  });

  await test.step("both questions of the brief work as written", async () => {
    await page.goto("/ops");
    await ask(page, "shipments to France this week running late");
    await expect(page.getByText("Destination: France")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").nth(1)).toContainText("EST-4134");

    await ask(page, "what's going on with order 12345?");
    await expect(page.getByText(/At sea on NORAY ALTAIR 612W/)).toBeVisible();
  });

  await test.step("a shipment outside the perimeter does not exist", async () => {
    await page.goto("/ops/shipments/EST-4058");
    await expect(page.getByRole("heading", { name: "EST-4058" })).toBeVisible();
    await switchPersona(page, "Iker Zabala");
    await expect(page.getByText("We couldn't find that shipment.")).toBeVisible();
  });
});
