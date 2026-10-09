import { describe, expect, test } from "vitest";
import { OPERATOR_ADAPTERS } from "@/adapters/operators";
import { ingestItems, type Ingested } from "@/domain/ingestion";
import { operatorEvents, type LoggedEvent, type RawMessage } from "@/domain/log";
import { inScope } from "@/domain/perimeter";
import { projectShipment } from "@/domain/projection";
import type { MilestoneCode, Place } from "@/domain/shipment";
import { allEntries } from "@/domain/timeline";
import {
  addDays,
  dayInstant,
  formatDay,
  isWorkingDay,
  localDate,
  localTime,
  type Instant,
  type LocalDate,
} from "@/domain/time";
import { DEMO_EVENTS, demoMessages, PERSONAS, SEED, SHIPMENTS, SITES, T0 } from "./index";

/** The pipeline the application runs at start-up, minus the text interpreter. */
function ingest(messages: readonly RawMessage[]): Ingested & { quarantined: string[] } {
  const result: Ingested & { quarantined: string[] } = {
    events: [],
    unread: [],
    orphans: [],
    quarantined: [],
  };
  for (const raw of messages) {
    const adapter = OPERATOR_ADAPTERS.find((candidate) => candidate.operatorId === raw.operatorId);
    const parsed = adapter?.parse(raw);
    if (!parsed?.ok) {
      result.quarantined.push(raw.id);
      continue;
    }
    const ingested = ingestItems(SHIPMENTS, raw, parsed.items);
    result.events.push(...ingested.events);
    result.unread.push(...ingested.unread);
    result.orphans.push(...ingested.orphans);
  }
  return result;
}

const seeded = ingest(SEED.messages);
const log: LoggedEvent[] = [...SEED.own.events, ...seeded.events];

function shipment(id: string) {
  const found = SHIPMENTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No shipment ${id}`);
  return found;
}

describe("the demo clock", () => {
  test("T0 is Wednesday 7 October 2026, 16:00 in Madrid and 08:00 in Veracruz", () => {
    expect(formatDay(localDate(T0, "Europe/Madrid"))).toBe("Wed 7 Oct");
    expect(localTime(T0, "Europe/Madrid")).toBe("16:00");
    expect(localTime(T0, "America/Mexico_City")).toBe("08:00");
  });

  test("nothing in the seed was received after T0", () => {
    expect(SEED.messages.filter((message) => message.receivedAt > T0)).toEqual([]);
    expect(SEED.own.raws.filter((message) => message.receivedAt > T0)).toEqual([]);
  });

  test("messages come in order of receipt, each with its own id", () => {
    const received = SEED.messages.map((message) => message.receivedAt);
    expect(received).toEqual([...received].sort((a, b) => a - b));
    const ids = [...SEED.messages, ...SEED.own.raws].map((message) => message.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the seed is real raw text that the adapters read", () => {
  test("no message is quarantined and no reference is orphaned", () => {
    expect(seeded.quarantined).toEqual([]);
    expect(seeded.orphans).toEqual([]);
  });

  test("exactly one message is free text: the customs email about EST-4012", () => {
    expect(seeded.unread.map((unread) => unread.shipment.id)).toEqual(["EST-4012"]);
    expect(seeded.unread[0]?.text).toContain("discrepancia de peso bruto");
    expect(SEED.messages.filter((message) => message.channel === "email")).toHaveLength(1);
  });

  test("all four operators and all five feeds are present", () => {
    const feeds = new Set(
      SEED.messages.map((message) => `${message.operatorId}/${message.channel}`),
    );
    expect([...feeds].sort()).toEqual([
      "CRZ/csv",
      "EVS/webhook",
      "NRY/api",
      "TGF/email",
      "TGF/report",
    ]);
  });

  test("the hand-written messages come out of the emitters character for character", () => {
    const bodies = SEED.messages.map((message) => message.body);
    for (const expected of [
      "CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;",
      "CRZ-2290311;60;ENTRADA EN TERMINAL;VALENCIA;22/09/2026 08:25;",
      "CRZ-2291310;40;ENTREGADO;SEVILLA;07/10/2026 12:05;FIRMADO: ALMACÉN. SIN RESERVAS",
      "CRZ-2291188;50;INCIDENCIA;TERUEL;06/10/2026 02:50;AVERÍA VEHÍCULO TRACTOR A-23. MERCANCÍA SIN DAÑOS",
      "CRZ-2291188;25;LLEGADA A PLATAFORMA;ZARAGOZA;06/10/2026 11:30;",
      "CRZ-2291188;50;INCIDENCIA;ZARAGOZA;06/10/2026 12:10;NUEVA ENTREGA PREVISTA 08/10",
      "CRZ-2291274;50;INCIDENCIA;MÁLAGA;07/10/2026 05:10;1 BULTO DAÑADO EN PLATAFORMA. MERCANCÍA RETENIDA A LA ESPERA DE INSTRUCCIONES",
      '{"eventType":"EQUIPMENT","equipmentEventTypeCode":"GTIN","eventClassifierCode":"ACT","emptyIndicatorCode":"LADEN","eventDateTime":"2026-09-22T08:31:00+02:00","UNLocationCode":"ESVLC","equipmentReference":"NRYU4821373"}',
      '{"eventType":"TRANSPORT","transportEventTypeCode":"ARRI","eventClassifierCode":"EST","eventDateTime":"2026-10-09T06:00:00-06:00","UNLocationCode":"MXVER","vesselName":"NORAY ALTAIR","carrierVoyageNumber":"612W"}',
      '{"sendungsnr":"EVS-88104652","status":"400","statustext":"Umschlag Eingang","ort":"Perpignan, FR","zeit":"2026-10-06T06:10:00+02:00","eta":"2026-10-08T10:00:00+02:00"}',
      '{"sendungsnr":"EVS-88104588","status":"510","statustext":"Unterwegs","ort":"La Jonquera, ES","zeit":"2026-10-06T13:00:00+02:00","lat":42.42,"lon":2.87,"eta":"2026-10-08T11:00:00+02:00"}',
    ]) {
      expect(bodies).toContain(expected);
    }
    const report = (row: string) =>
      `expediente;ref_cliente;concepto;estado;fecha;observaciones\n${row}`;
    for (const row of [
      "TGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;23/09/2026;MRN 26ES00461130047821",
      "TGF-26-03412;12345;DOCUMENTO;BL EMITIDO;28/09/2026;",
      "TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;",
      "TGF-26-03290;48176;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;",
      "TGF-26-03290;48176;ENTREGA;ETA PENDIENTE;;Pendiente de aduana",
    ]) {
      expect(bodies).toContain(report(row));
    }
  });

  test("messages said to have been received at a given time were", () => {
    const receivedAt = (fragment: string) => {
      const message = SEED.messages.find((candidate) => candidate.body.includes(fragment));
      return message
        ? `${localDate(message.receivedAt, "Europe/Madrid")} ${localTime(message.receivedAt, "Europe/Madrid")}`
        : undefined;
    };
    expect(receivedAt('"transportEventTypeCode":"ARRI","eventClassifierCode":"EST"')).toBe(
      "2026-10-05 07:00",
    );
    expect(receivedAt("TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;")).toBe("2026-10-06 08:30");
    expect(receivedAt("TGF-26-03290;48176;ENTREGA;ETA;07/10/2026;")).toBe("2026-10-05 08:30");
    expect(receivedAt("PEDIMENTO PRESENTADO;05/10/2026")).toBe("2026-10-06 08:30");
    expect(receivedAt("Reconocimiento aduanero")).toBe("2026-10-06 17:55");
    expect(receivedAt("ETA PENDIENTE")).toBe("2026-10-07 08:30");
  });

  test("each message arrives the way its channel delivers", () => {
    const madrid = (instant: Instant) =>
      [localDate(instant, "Europe/Madrid"), localTime(instant, "Europe/Madrid")] as const;

    // Cierzo drops a batch file on every even hour; Turia reports at 08:30 on working days.
    for (const message of SEED.messages) {
      const [date, time] = madrid(message.receivedAt);
      if (message.channel === "csv") expect(time, message.body).toMatch(/^([01][02468]|2[02]):00$/);
      if (message.channel === "report") {
        expect(time, message.body).toBe("08:30");
        expect(isWorkingDay(date), message.body).toBe(true);
      }
    }

    const lagOf = (source: string) =>
      operatorEvents(seeded.events)
        .filter((event) => event.source === source && event.fact.type === "milestone")
        .map((event) => (event.receivedAt - event.occurredAt) / 60_000);
    expect(lagOf("CRZ").every((minutes) => minutes > 0 && minutes <= 120)).toBe(true);
    expect(new Set(lagOf("EVS"))).toEqual(new Set([1]));
    expect(new Set(lagOf("NRY"))).toEqual(new Set([10]));
  });

  test("a vessel event is one message that fans out to every shipment aboard", () => {
    const departure = SEED.messages.filter((message) => message.body.includes('"DEPA"'));
    expect(departure).toHaveLength(3);
    const altair = departure.find((message) => message.body.includes("NORAY ALTAIR"));
    const aboard = operatorEvents(log)
      .filter((event) => event.rawId === altair?.id)
      .map((event) => event.shipmentId);
    expect(aboard.sort()).toEqual(["EST-4058", "EST-4063"]);
  });
});

describe("the calendar", () => {
  const ROAD_OFFICE_AND_CUSTOMS: ReadonlySet<MilestoneCode> = new Set([
    "BOOKED",
    "PICKED_UP",
    "HUB_IN",
    "HUB_OUT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "EXPORT_RELEASED",
    "IMPORT_LODGED",
    "IMPORT_RELEASED",
  ]);
  const VALENCIA_REGION = new Set(["Riba-roja de Túria", "Valencia"]);

  type Dated = { what: string; code: MilestoneCode; place: Place; date: LocalDate };

  const plans: Dated[] = SHIPMENTS.flatMap((s) =>
    s.plan.map((planned) => ({
      what: `${s.id} planned ${planned.key}`,
      code: planned.code,
      place: planned.place,
      date: localDate(planned.plannedAt, planned.place.zone),
    })),
  );
  const facts: Dated[] = operatorEvents(log).flatMap((event) =>
    event.fact.type === "milestone" || event.fact.type === "estimate"
      ? [
          {
            what: `${event.shipmentId} ${event.fact.type} ${event.fact.code}`,
            code: event.fact.code,
            place: event.fact.place,
            date: localDate(
              event.fact.type === "estimate" ? event.fact.at : event.occurredAt,
              event.fact.place.zone,
            ),
          },
        ]
      : [],
  );
  const working = [...plans, ...facts].filter((dated) => ROAD_OFFICE_AND_CUSTOMS.has(dated.code));

  test("road, office and customs events fall on working days", () => {
    expect(working.length).toBeGreaterThan(200);
    expect(working.filter((dated) => !isWorkingDay(dated.date)).map((dated) => dated.what)).toEqual(
      [],
    );
  });

  test("truck positions are only sent on working days", () => {
    const pings = operatorEvents(log).filter((event) => event.fact.type === "position");
    expect(pings.length).toBeGreaterThan(100);
    expect(
      pings.filter((event) => !isWorkingDay(localDate(event.occurredAt, "Europe/Madrid"))),
    ).toEqual([]);
  });

  test("nothing happens in Spain on Monday 12 October, a national holiday", () => {
    const onHoliday = working.filter(
      (dated) => dated.place.country === "ES" && dated.date === "2026-10-12",
    );
    expect(onHoliday.map((dated) => dated.what)).toEqual([]);
  });

  test("nothing happens in Valencia on Friday 9 October, a regional holiday: no Riba-roja pickup", () => {
    const onHoliday = working.filter(
      (dated) => VALENCIA_REGION.has(dated.place.name) && dated.date === "2026-10-09",
    );
    expect(onHoliday.map((dated) => dated.what)).toEqual([]);
  });

  test("no pickup, delivery or customs event anywhere in Spain on either holiday", () => {
    const stopped = new Set<MilestoneCode>([
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "EXPORT_RELEASED",
    ]);
    const onHoliday = working.filter(
      (dated) =>
        dated.place.country === "ES" &&
        stopped.has(dated.code) &&
        (dated.date === "2026-10-09" || dated.date === "2026-10-12"),
    );
    expect(onHoliday.map((dated) => dated.what)).toEqual([]);
  });

  test("goods never wait at a delivering platform that is open: the round leaves on its first working day there", () => {
    const isOpen = (place: Place, date: LocalDate) =>
      isWorkingDay(date) &&
      !(place.country === "ES" && date === "2026-10-12") &&
      !(VALENCIA_REGION.has(place.name) && date === "2026-10-09");
    const waiting = SHIPMENTS.flatMap((s) => {
      const arrival = s.plan.findLast((planned) => planned.code === "HUB_IN");
      const round = s.plan.find((planned) => planned.code === "OUT_FOR_DELIVERY");
      if (!arrival || !round || arrival.place.name !== round.place.name) return [];
      let first = localDate(arrival.plannedAt, arrival.place.zone);
      while (!isOpen(arrival.place, first)) first = addDays(first, 1);
      const leaves = localDate(round.plannedAt, round.place.zone);
      return leaves === first
        ? []
        : [`${s.id}: at ${arrival.place.name} ${first}, round ${leaves}`];
    });
    expect(waiting).toEqual([]);
  });

  test("vessels sail on Fridays and arrive fourteen days later", () => {
    for (const s of SHIPMENTS.filter((candidate) => candidate.voyage)) {
      const planned = (code: MilestoneCode) => {
        const milestone = s.plan.find((candidate) => candidate.code === code);
        if (!milestone) throw new Error(`${s.id} has no ${code}`);
        return localDate(milestone.plannedAt, milestone.place.zone);
      };
      expect(formatDay(planned("VESSEL_DEPARTED"))).toMatch(/^Fri /);
      expect(dayInstant(planned("VESSEL_ARRIVED")) - dayInstant(planned("VESSEL_DEPARTED"))).toBe(
        14 * 24 * 3_600_000,
      );
    }
  });

  test("committed dates are working days", () => {
    expect(SHIPMENTS.filter((s) => !isWorkingDay(s.committedDate))).toEqual([]);
  });
});

describe("telematics trails are something a truck can drive", () => {
  type Ping = { sendungsnr: string; at: Instant; ort: string; lat: number; lon: number };
  const pings: Ping[] = SEED.messages
    .filter((message) => message.operatorId === "EVS" && message.body.includes('"status":"510"'))
    .map((message) => {
      const payload = JSON.parse(message.body) as Omit<Ping, "at"> & { zeit: string };
      return { ...payload, at: Date.parse(payload.zeit) };
    })
    .sort((a, b) => a.sendungsnr.localeCompare(b.sendungsnr) || a.at - b.at);

  const km = (a: Ping, b: Ping) => {
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    const h =
      Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  /** Two pings of one truck half an hour apart: it drove from one to the other. */
  const hops = pings.flatMap((ping, index) => {
    const before = pings[index - 1];
    return before && before.sendungsnr === ping.sendungsnr && ping.at - before.at === 30 * 60_000
      ? [{ before, ping }]
      : [];
  });

  test("no half hour is driven faster than 90 km/h as the crow flies", () => {
    expect(hops.length).toBeGreaterThan(100);
    const tooFast = hops
      .map(({ before, ping }) => ({ before, ping, kmh: Math.round(km(before, ping) * 2) }))
      .filter((hop) => hop.kmh > 90)
      .map((hop) => `${hop.ping.sendungsnr} ${hop.before.ort} to ${hop.ping.ort}: ${hop.kmh} km/h`);
    expect(tooFast).toEqual([]);
  });

  test("no truck drives more than 4.5 hours without a 45-minute break (Regulation (EC) 561/2006, art. 7)", () => {
    const longest = new Map<string, number>();
    let hours = 0;
    hops.forEach(({ before, ping }, index) => {
      // The first ping of a stretch comes half an hour into it.
      hours = hops[index - 1]?.ping === before ? hours + 0.5 : 1;
      longest.set(ping.sendungsnr, Math.max(longest.get(ping.sendungsnr) ?? 0, hours));
    });
    expect([...longest].filter(([, stretch]) => stretch > 4.5)).toEqual([]);
  });
});

describe("shipments", () => {
  test("there are 23, by site ZAZ 10, VLC 8, BIO 5 and by account AQB 8, VAU 5, IDE 4, THA 3, HIS 3", () => {
    const count = (key: "originSiteId" | "accountId") =>
      SHIPMENTS.reduce<Record<string, number>>(
        (totals, s) => ({ ...totals, [s[key]]: (totals[s[key]] ?? 0) + 1 }),
        {},
      );
    expect(SHIPMENTS).toHaveLength(23);
    expect(count("originSiteId")).toEqual({ ZAZ: 10, VLC: 8, BIO: 5 });
    expect(count("accountId")).toEqual({ AQB: 8, VAU: 5, IDE: 4, THA: 3, HIS: 3 });
  });

  test("ids, order numbers and operator references are unique", () => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    expect(unique(SHIPMENTS.map((s) => s.id))).toBe(true);
    expect(unique(SHIPMENTS.map((s) => s.orderRef))).toBe(true);
    expect(
      unique(SHIPMENTS.flatMap((s) => s.refs.map((ref) => `${ref.operatorId}:${ref.value}`))),
    ).toBe(true);
  });

  test("the brief's own example is there: order 12345 is EST-4058", () => {
    expect(SHIPMENTS.find((s) => s.orderRef === "12345")?.id).toBe("EST-4058");
  });

  test("container numbers carry a valid ISO 6346 check digit", () => {
    const value = (character: string) => {
      if (/\d/.test(character)) return Number(character);
      // Letters count from 10 and skip every multiple of 11.
      const position = character.charCodeAt(0) - 65;
      return 10 + position + Math.floor((position + 9) / 10);
    };
    const checkDigit = (number: string) =>
      ([...number.slice(0, 10)].reduce(
        (sum, character, index) => sum + value(character) * 2 ** index,
        0,
      ) %
        11) %
      10;

    expect(checkDigit("CSQU305438")).toBe(3);
    const containers = SHIPMENTS.flatMap((s) =>
      s.cargo.container ? [s.cargo.container.number] : [],
    );
    expect(containers).toHaveLength(8);
    for (const number of containers) {
      expect(number).toMatch(/^NRYU\d{7}$/);
      expect(`${number}: ${checkDigit(number)}`).toBe(`${number}: ${number.at(-1)}`);
    }
  });

  test("every plan starts with the booking, is ordered in time and has unique keys", () => {
    for (const s of SHIPMENTS) {
      expect(s.plan[0]).toMatchObject({ code: "BOOKED", sectionId: null });
      const times = s.plan.map((planned) => planned.plannedAt);
      expect(times, s.id).toEqual([...times].sort((a, b) => a - b));
      expect(new Set(s.plan.map((planned) => planned.key)).size, s.id).toBe(s.plan.length);
      expect(s.plan.at(-1)?.code).toBe("DELIVERED");
    }
  });

  test("every milestone sits in a section of its shipment, and sections follow the plan", () => {
    for (const s of SHIPMENTS) {
      const sections = s.sections.map((section) => section.id);
      const used = s.plan.flatMap((planned) => (planned.sectionId ? [planned.sectionId] : []));
      expect(
        used.filter((id) => !sections.includes(id)),
        s.id,
      ).toEqual([]);
      expect([...new Set(used)], s.id).toEqual(sections);
    }
  });

  test("every deadline protects a milestone of its plan", () => {
    for (const s of SHIPMENTS) {
      const keys = s.plan.map((planned) => planned.key);
      expect(s.deadlines.filter((deadline) => !keys.includes(deadline.milestoneKey ?? ""))).toEqual(
        [],
      );
    }
  });

  test("sites and personas line up with the shipments", () => {
    const siteIds = SITES.map((site) => site.id);
    expect(SHIPMENTS.filter((s) => !siteIds.includes(s.originSiteId))).toEqual([]);
    expect(PERSONAS.map((actor) => SHIPMENTS.filter((s) => inScope(actor, s)).length)).toEqual([
      23, 5, 13, 8, 5,
    ]);
  });
});

describe("what the seed says beyond the roster, read from the raw messages", () => {
  const project = (id: string) =>
    projectShipment({ shipment: shipment(id), events: log, estimate: null, now: T0 });

  test("six shipments were delivered, each on its day", () => {
    const delivered = Object.fromEntries(
      SHIPMENTS.flatMap((s) => {
        const stamp = project(s.id).dates.delivered;
        if (!stamp) return [];
        const zone = s.consignee.place.zone;
        const time = stamp.precision === "day" ? "" : ` ${localTime(stamp.at, zone)}`;
        return [[s.id, `${stamp.day}${time}`]];
      }),
    );
    expect(delivered).toEqual({
      "EST-4019": "2026-10-01",
      "EST-4107": "2026-10-05 08:50",
      "EST-4111": "2026-10-06 15:10",
      "EST-4115": "2026-10-06 09:40",
      "EST-4120": "2026-10-06 10:22",
      "EST-4133": "2026-10-07 12:05",
    });
  });

  test("EST-4058's gate-in is one milestone from two sources, showing the line's time", () => {
    const gateIn = project("EST-4058")
      .timeline.sections.flatMap((section) => section.entries)
      .find((entry) => entry.type === "milestone" && entry.code === "GATE_IN");
    expect(gateIn).toMatchObject({
      sources: [{ source: "NRY" }, { source: "CRZ" }],
      actual: { provenance: { source: "NRY" } },
    });
    expect(
      gateIn?.type === "milestone" && gateIn.actual && localTime(gateIn.actual.at, "Europe/Madrid"),
    ).toBe("08:31");
  });

  test("EST-4128 went back to the Zaragoza platform: an unplanned hub scan, a note and a new date", () => {
    const entries = project("EST-4128").timeline.sections[0]?.entries ?? [];
    expect(entries.slice(0, 3)).toMatchObject([
      { type: "milestone", code: "PICKED_UP", state: "done" },
      { type: "note", text: "AVERÍA VEHÍCULO TRACTOR A-23. MERCANCÍA SIN DAÑOS" },
      { type: "milestone", code: "HUB_IN", place: { name: "Zaragoza" }, unplanned: true },
    ]);
  });

  test("every report found its milestone in the plan, except the one stop nobody planned", () => {
    const outsideThePlan = SHIPMENTS.flatMap((s) =>
      allEntries(project(s.id).timeline).flatMap((entry) => {
        if (entry.type === "milestone" && entry.unplanned) return [`${s.id} ${entry.key}`];
        if (entry.type === "note" && entry.status) return [`${s.id} ${entry.status}`];
        return [];
      }),
    );
    expect(outsideThePlan).toEqual(["EST-4128 HUB_IN@ZARAGOZA"]);
  });

  test("EST-4036 left the port before the report of its customs release arrived", () => {
    const beforeTheReport = projectShipment({
      shipment: shipment("EST-4036"),
      events: log.filter(
        (event) => event.kind !== "operator" || event.receivedAt < T0 - 8 * 3_600_000,
      ),
      estimate: null,
      now: T0 - 8 * 3_600_000,
    });
    expect(beforeTheReport.stage).toBe("final_leg");
    expect(beforeTheReport.importGate?.state).toBe("lodged");
    expect(project("EST-4036").importGate?.state).toBe("released");
  });

  test("documents are complete for each stage, with three known exceptions", () => {
    const notOnFile = Object.fromEntries(
      SHIPMENTS.flatMap((s) => {
        const open = project(s.id)
          .documents.filter((d) => d.status === "missing" || d.status === "pending")
          .map((d) => `${d.docType}: ${d.status}`);
        return open.length > 0 ? [[s.id, open]] : [];
      }),
    );
    expect(notOnFile).toEqual({
      "EST-4111": ["proof_of_delivery: pending"],
      "EST-4116": ["commercial_invoice: missing"],
      "EST-4133": ["proof_of_delivery: pending"],
    });
    for (const id of ["EST-4147", "EST-4149"]) {
      expect(project(id).documents.every((d) => d.status === "not_yet_due")).toBe(true);
    }
  });
});

describe("demo events", () => {
  const now = T0 + 5 * 60_000;
  const send = (id: string) => {
    const event = DEMO_EVENTS.find((candidate) => candidate.id === id);
    if (!event) throw new Error(`No demo event ${id}`);
    return ingest(demoMessages(event, now));
  };

  test("there are four, each naming what it sends, with its precondition as data", () => {
    expect(DEMO_EVENTS.map((event) => [event.id, event.operatorId, event.precondition])).toEqual([
      ["A", "NRY", { kind: "none" }],
      ["B", "TGF", { kind: "demo_event_sent", id: "A" }],
      [
        "C",
        "TGF",
        { kind: "document_sent", shipmentId: "EST-4012", docType: "commercial_invoice" },
      ],
      ["D", "EVS", { kind: "none" }],
    ]);
  });

  test("every payload is read by its adapter and finds its shipment", () => {
    for (const event of DEMO_EVENTS) {
      const result = send(event.id);
      expect(result.quarantined, event.id).toEqual([]);
      expect(result.orphans, event.id).toEqual([]);
      expect(result.events.length, event.id).toBeGreaterThan(0);
    }
  });

  test("A fans out to both shipments on NORAY ALTAIR, with the reason kept", () => {
    const { events } = send("A");
    expect(events.map((event) => event.shipmentId).sort()).toEqual(["EST-4058", "EST-4063"]);
    expect(events[0]).toMatchObject({
      fact: {
        type: "estimate",
        code: "VESSEL_ARRIVED",
        remark: expect.stringContaining("WEA: Port closed to navigation"),
      },
      receivedAt: now,
    });
  });

  test("B declares Fri 16 Oct for both shipments; C releases EST-4012 and gives it a door date", () => {
    expect(send("B").events.map((event) => event.shipmentId)).toEqual(["EST-4058", "EST-4063"]);
    const released = send("C").events.map((event) => event.kind === "operator" && event.fact.type);
    expect(released).toEqual(["milestone", "hold", "note", "estimate"]);
  });

  test("D is sent with the time of sending, as a position of EST-4127", () => {
    const { events } = send("D");
    expect(events[0]).toMatchObject({
      shipmentId: "EST-4127",
      fact: { type: "position", place: "Besançon, FR" },
      occurredAt: now,
    });
  });
});
