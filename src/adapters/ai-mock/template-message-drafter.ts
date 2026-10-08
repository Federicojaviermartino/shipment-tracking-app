import type {
  DraftFacts,
  DraftRequest,
  DraftText,
  MessageDrafter,
  Moment,
} from "@/application/ports/message-drafter";
import { DOCUMENT_LABEL, MILESTONE_LABEL } from "@/domain/labels";
import type { DocumentType } from "@/domain/shipment";
import {
  addDays,
  diffDays,
  formatDay,
  formatStamp,
  localDate,
  localTime,
  type LocalDate,
} from "@/domain/time";

/**
 * Stands in for a language model whose only context is the fact sheet. One template per
 * audience, exception and cause; every slot is filled from the request, and the keys it read are
 * reported back as `factsUsed`. Customer copy states what happened and what comes next: no fault
 * or liability wording, and never "nothing for you to do" on an import matter, because under
 * these incoterms the consignee is the importer.
 */

type Sheet = {
  /** The facts as given, for looking without leaning on them. */
  facts: DraftFacts;
  /** Reads a fact and records that the text rests on it. */
  use<Key extends keyof DraftFacts>(key: Key): DraftFacts[Key];
  used(): string[];
};

function sheetOf(facts: DraftFacts): Sheet {
  const read = new Set<string>();
  return {
    facts,
    use(key) {
      const value = facts[key];
      const empty =
        value === null || value === false || (Array.isArray(value) && value.length === 0);
      if (!empty) read.add(key);
      return value;
    },
    used: () => [...read],
  };
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

function spelled(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

function days(count: number): string {
  return `${spelled(count)} day${count === 1 ? "" : "s"}`;
}

function moment(value: Moment): string {
  return formatStamp(value.at, value.precision, value.zone);
}

function dayOf(value: Moment): LocalDate {
  return localDate(value.at, value.zone);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Customs found X; a corrected invoice is required." says what happened before the semicolon. */
function finding(reason: string): string {
  return (reason.split(";")[0] ?? reason).trim().replace(/\.$/, "");
}

function relativeDay(day: LocalDate, today: LocalDate): string {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  return `on ${formatDay(day)}`;
}

/** In running text an invoice is "the invoice", whatever customs calls it. */
function documentWord(docType: DocumentType): string {
  return docType === "commercial_invoice" ? "invoice" : DOCUMENT_LABEL[docType].toLowerCase();
}

/**
 * What an operator's remark says about the cause, for the cases a customer can be told plainly.
 * Operators write in their own shorthand and language; anything not recognised here is left
 * out of the draft rather than passed on.
 */
function portCause(remark: string | null, port: string): string | null {
  if (!remark) return null;
  const weather = /\b(WEA|weather|norther|storm|gusts?|wind)\b/i.test(remark);
  if (/closed/i.test(remark)) {
    return `The port of ${port} is closed to navigation${weather ? " because of bad weather" : ""}`;
  }
  if (/congest/i.test(remark)) return `The port of ${port} is congested`;
  if (weather) return `Bad weather is affecting the port of ${port}`;
  return null;
}

/**
 * Why the date moved, from the most specific thing the record says: an operator pushing back an
 * earlier milestone, then a breakdown the carrier wrote about, then a report that never came.
 */
function causeOf(sheet: Sheet): string[] {
  const upstream = sheet.use("upstream");
  if (upstream) {
    const why = portCause(upstream.remark, upstream.place);
    const due = formatDay(dayOf(upstream.now));
    const instead = upstream.was ? ` instead of ${formatDay(dayOf(upstream.was))}` : "";
    const what =
      upstream.milestone === "VESSEL_ARRIVED"
        ? `the vessel carrying your shipment is now due to berth${why ? "" : ` in ${upstream.place}`} on ${due}`
        : `"${MILESTONE_LABEL[upstream.milestone]}" at ${upstream.place} is now expected on ${due}`;
    return [why ? `${why}, so ${what}${instead}.` : `${upperFirst(what)}${instead}.`];
  }

  const breakdown = sheet.facts.remarks.find((remark) => /AVER[IÍ]A/i.test(remark.text));
  if (breakdown) {
    sheet.use("remarks");
    const sentences = [
      `The truck carrying your shipment broke down on ${formatDay(dayOf(breakdown.at))}.`,
    ];
    if (/SIN DAÑOS/i.test(breakdown.text)) sentences.push("The goods were not damaged.");
    return sentences;
  }

  const overdue = sheet.use("overdue");
  if (!overdue) return [];
  return [
    overdue.last.milestone === "HUB_IN"
      ? `Your shipment has stayed at our carrier's ${overdue.last.place} hub longer than planned and may have missed its departure.`
      : `Your shipment was last reported at ${overdue.last.place} on ${moment(overdue.last.at)} and may be running behind plan.`,
  ];
}

function join(sentences: (string | null | false | undefined)[]): string {
  return sentences.filter((sentence): sentence is string => Boolean(sentence)).join(" ");
}

function customerDateChange(request: DraftRequest, sheet: Sheet): Omit<DraftText, "factsUsed"> {
  const { shipment } = request;
  const order = `Order ${shipment.orderRef}`;
  const cause = causeOf(sheet);

  // Estela works the delay out by itself: say so, next to what the carrier still announces.
  const own = request.basis === "inferred" ? sheet.use("estelaDoor") : null;
  if (own) {
    const operator = sheet.use("operatorDoor");
    const late = diffDays(sheet.use("committed"), own.day);
    return {
      subject: `${order}: possible ${spelled(late)}-day delay`,
      body: join([
        ...cause,
        operator
          ? `The carrier still announces delivery on ${formatDay(operator.day)}; our own estimate is ${formatDay(own.day)}.`
          : `Our own estimate for delivery in ${shipment.destination} is ${formatDay(own.day)}.`,
        "We are checking with the carrier and will confirm today.",
      ]),
    };
  }

  const published = sheet.use("published");
  if (published?.basis === "estela_estimate") {
    const planned = sheet.use("planned");
    const operator = sheet.use("operatorDoor");
    const later = planned ? diffDays(planned, published.day) : 0;
    return {
      subject: `${order}: new delivery estimate, ${formatDay(published.day)}`,
      body: join([
        ...cause,
        `We estimate delivery in ${shipment.destination} on ${formatDay(published.day)}${later > 0 ? `, ${days(later)} later than planned` : ""}.`,
        "This is our own estimate; we will confirm it as soon as the carrier does.",
        operator?.superseded &&
          `If you have booked a receiving slot for ${formatDay(operator.day)}, please move it.`,
      ]),
    };
  }

  if (published) {
    const late = diffDays(sheet.use("committed"), published.day);
    return {
      subject: `${order}: delivery moved to ${formatDay(published.day)}`,
      body: join([
        ...cause,
        `The carrier now plans delivery in ${shipment.destination} on ${formatDay(published.day)}${late > 0 ? `, ${days(late)} later than committed` : ""}.`,
      ]),
    };
  }

  return {
    subject: `${order}: delivery delayed`,
    body: join([
      ...cause,
      `Your shipment was due on ${formatDay(sheet.use("committed"))} and has not been delivered yet.`,
      "We are checking with the carrier and will send you a new date as soon as we have one.",
    ]),
  };
}

function customerHold(request: DraftRequest, sheet: Sheet): Omit<DraftText, "factsUsed"> {
  const { shipment } = request;
  const hold = sheet.use("hold");
  const order = `Order ${shipment.orderRef}`;
  if (!hold) return customerDateChange(request, sheet);
  const estela = sheet.use("estelaDoor");

  if (hold.kind === "customs") {
    const document = sheet.use("document");
    const word = document ? documentWord(document.docType) : "document";
    const release = estela?.assumedRelease
      ? relativeDay(estela.assumedRelease, sheet.use("today"))
      : "soon";
    const outlook =
      estela && diffDays(sheet.use("committed"), estela.day) <= 0
        ? `delivery in ${shipment.destination} stays on ${formatDay(estela.day)}`
        : estela && `we estimate delivery in ${shipment.destination} on ${formatDay(estela.day)}`;
    return {
      subject: `${order}: held at ${hold.place ? `${hold.place} ` : ""}customs for a document check`,
      body: join([
        `${finding(hold.reason)}.`,
        document &&
          (document.sentOn
            ? `We sent a corrected ${word} to the broker ${relativeDay(document.sentOn, sheet.use("today"))}.`
            : `We are preparing a corrected ${word} for the broker.`),
        outlook &&
          `If customs releases the shipment ${release}, ${outlook}; we will confirm as soon as we hear.`,
        shipment.consigneeClearsImport &&
          `Your broker may be asked to present the corrected ${word}.`,
      ]),
    };
  }

  const deadline = sheet.use("deadline");
  const round = deadline ? `the first round on ${formatDay(dayOf(deadline.at))}` : null;
  const asked = round ? sheet.use("operatorContacted") : false;
  return {
    subject: `${order}: delivery on hold`,
    body: join([
      `The carrier is holding your shipment${hold.place ? ` at its ${hold.place} platform` : ""}: ${lowerFirst(finding(hold.reason))}.`,
      round
        ? `${asked ? "We have asked" : "We are asking"} the carrier to deliver what can move on ${round}, and will confirm the plan today.`
        : "We are in contact with the carrier and will confirm a new delivery date as soon as we have one.",
      estela &&
        round &&
        `If the goods are released for that round, delivery in ${shipment.destination} would be on ${formatDay(estela.day)}.`,
    ]),
  };
}

function operatorMessage(request: DraftRequest, sheet: Sheet): Omit<DraftText, "factsUsed"> {
  const { shipment, recipient } = request;
  const reference = recipient.reference ?? `order ${shipment.orderRef}`;
  const opening = `Reference ${reference}.`;
  const hold = sheet.use("hold");

  if (request.step === "send_document") {
    const document = sheet.use("document");
    const label = document ? DOCUMENT_LABEL[document.docType].toLowerCase() : "document";
    const attached = document ? ` (${document.fileName})` : "";
    if (hold) {
      const deadline = sheet.use("deadline");
      return {
        subject: `${reference}: corrected ${label}`,
        body: join([
          opening,
          `Your message of ${moment(hold.since)} reports a customs hold: ${lowerFirst(hold.reason)}`,
          `Attached is the corrected ${label}${attached}.`,
          "Please pass it to the broker today and confirm when customs releases the shipment.",
          deadline && `Free time at the terminal ends on ${formatDay(dayOf(deadline.at))}.`,
        ]),
      };
    }
    const gateIn = sheet.use("gateIn");
    const deadline = sheet.use("deadline");
    const container = shipment.container ? `Container ${shipment.container}` : "The container";
    return {
      subject: `${reference}: ${label} for export clearance`,
      body: join([
        opening,
        gateIn && `${container} entered the terminal at ${gateIn.place} on ${moment(gateIn.at)}.`,
        `Attached is the ${label}${attached}.`,
        deadline
          ? `Please lodge the export declaration before the cut-off on ${moment(deadline.at)}${shipment.vessel ? ` for ${shipment.vessel}` : ""}.`
          : "Please lodge the export declaration as soon as possible.",
      ]),
    };
  }

  if (hold) {
    const damage = /damage/i.test(hold.reason);
    const deadline = sheet.use("deadline");
    const round = deadline
      ? ` on the first round on ${moment(deadline.at)}`
      : " on your next delivery round";
    return {
      subject: `${reference}: ${damage ? "release the intact goods, photos of the damage" : "release of the goods on hold"}`,
      body: join([
        opening,
        `You reported on ${moment(hold.since)}${hold.place ? ` at ${hold.place}` : ""}: ${lowerFirst(hold.reason)}.`,
        `Please deliver what ${damage ? "is intact" : "can move"}${round}${damage ? ", and send photos of the damage with the incident report." : "."}`,
      ]),
    };
  }

  const silence = sheet.use("silence");
  if (silence) {
    return {
      subject: `${reference}: position and ETA`,
      body: join([
        opening,
        `The last position we received was ${silence.lastPlace ?? "unknown"} on ${moment(silence.since)}, ${silence.hours} h ago.`,
        `Please send the current position of the truck and its ETA at ${shipment.destination}.`,
      ]),
    };
  }

  const overdue = sheet.use("overdue");
  if (overdue) {
    const departure = overdue.expected.milestone === "HUB_OUT";
    const deadline = sheet.use("deadline");
    const linehaul = deadline
      ? `If not, please confirm it will be on the ${localTime(deadline.at.at, deadline.at.zone)} departure on ${formatDay(dayOf(deadline.at))} and tell us the delivery date you now expect.`
      : "If not, please tell us when it will and the delivery date you now expect.";
    return {
      subject: departure
        ? `${reference}: departure from ${overdue.expected.place}?`
        : `${reference}: status and ETA`,
      body: join([
        opening,
        `Our records show "${MILESTONE_LABEL[overdue.last.milestone]}" at ${overdue.last.place} on ${moment(overdue.last.at)}; "${MILESTONE_LABEL[overdue.expected.milestone]}", planned for ${moment(overdue.expected.at)}, has not reached us.`,
        departure
          ? `Has the shipment left ${overdue.expected.place}?`
          : "Has this happened in the meantime?",
        linehaul,
      ]),
    };
  }

  return {
    subject: `${reference}: status and ETA`,
    body: join([
      opening,
      `Please confirm the current status of the shipment and its ETA at ${shipment.destination}.`,
    ]),
  };
}

function draft(request: DraftRequest): DraftText {
  const sheet = sheetOf(request.facts);
  const text =
    request.audience === "operator"
      ? operatorMessage(request, sheet)
      : request.exception === "customs_hold" || request.exception === "carrier_hold"
        ? customerHold(request, sheet)
        : customerDateChange(request, sheet);
  return { ...text, factsUsed: sheet.used() };
}

export const templateMessageDrafter: MessageDrafter = {
  draft: (request) => Promise.resolve(draft(request)),
};
