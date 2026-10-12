# Estela — specification, part 2: the synthetic world

Everything is invented except geography. The dataset is small, internally consistent and realistic
for industrial logistics. It lives in `src/fixtures` as typed data plus lane builders.

## 1. The demo clock

- **T0 = Wednesday 7 October 2026, 16:00 Europe/Madrid** (14:00 UTC; 08:00 in Veracruz and
  Querétaro). The demo world is frozen at that instant and then runs in real time:
  `now = T0 + (real time elapsed since the session started)`. The demo bar shows the demo clock.
- A fixed weekday afternoon is deliberate: trucks, offices and customs do not work weekends, and a
  load-time T0 would produce Saturday deliveries and 03:00 delivery rounds.
- Calendar facts to respect: Fri 9 Oct is a regional holiday in Valencia and Mon 12 Oct a national
  holiday in Spain (no Spanish road pickups, deliveries or customs office events on those days; port
  terminals and vessels run all week). Europe leaves DST on Sun 25 Oct. Road, office and customs
  events fall on working days; vessel and terminal events may fall on any day.
- All dates below are local to the place of the event. Write fixtures with a helper such as
  `at('2026-09-22 08:25', MADRID)` so each date can be checked against this document.

## 2. The manufacturer and its sites

**Ibón Fluid Systems, S.A.** (Zaragoza): industrial pumps, valves and packaged pumping stations for
water treatment, irrigation and desalination. Product families used in cargo lines: LN and MV pumps,
SR submersible pumps, VB and VG valves, BS booster skids, spare and seal kits.

| Code  | Site                                               | Role                                           |
| ----- | -------------------------------------------------- | ---------------------------------------------- |
| `ZAZ` | Zaragoza plant (PLAZA logistics park), Zaragoza    | factory: pump assembly and test                |
| `BIO` | Abadiño plant, Abadiño (Bizkaia)                   | factory: foundry and valves                    |
| `VLC` | Riba-roja warehouse, Riba-roja de Túria (Valencia) | warehouse: stock, spares, export consolidation |

## 3. Operators: four feeds, four formats

Each raw message is stored one event per message (a CSV line, a report row with its header, one JSON
object, one email), so "Show original" can never leak another shipment's row.

### 3.1 Transportes Cierzo (`CRZ`), road carrier

Spanish domestic road and pre-carriage to the port of Valencia. No telematics: depot and delivery
scans only. Channel `csv` (batch file over SFTP every two hours), semicolon-separated, Spanish, wall
clock times **without zone** (to be read as Europe/Madrid):

```text
expedicion;codigo;estado;plaza;fecha;observaciones
CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;
CRZ-2290311;60;ENTRADA EN TERMINAL;VALENCIA;22/09/2026 08:25;
CRZ-2291310;40;ENTREGADO;SEVILLA;07/10/2026 12:05;FIRMADO: ALMACÉN. SIN RESERVAS
```

| Code and text                                           | Canonical                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `10 RECOGIDA EFECTUADA`                                 | `PICKED_UP`                                                         |
| `25 LLEGADA A PLATAFORMA`                               | `HUB_IN` at `plaza`                                                 |
| `26 SALIDA DE PLATAFORMA`                               | `HUB_OUT` at `plaza`                                                |
| `30 EN REPARTO`                                         | `OUT_FOR_DELIVERY`                                                  |
| `40 ENTREGADO`                                          | `DELIVERED`                                                         |
| `60 ENTRADA EN TERMINAL`                                | `GATE_IN`                                                           |
| `50 INCIDENCIA` + remark matching `RETENID`             | hold `carrier` raised, reason = fixed English rendering per pattern |
| `50 INCIDENCIA` + remark `NUEVA ENTREGA PREVISTA dd/mm` | estimate for `DELIVERED`, day precision                             |
| `55 INCIDENCIA RESUELTA`                                | hold `carrier` cleared                                              |
| `50 INCIDENCIA` + anything else                         | `note` (remark kept verbatim)                                       |
| any other code                                          | `note`                                                              |

### 3.2 Eisvogel Spedition (`EVS`), road carrier

EU road. Full loads run on its own fleet with telematics (a position every 30 minutes while driving);
groupage moves through depots and hubs and is tracked by scans only. Channel `webhook`, JSON with
German keys, ISO 8601 times with offset:

```json
{"sendungsnr":"EVS-88104652","status":"400","statustext":"Umschlag Eingang","ort":"Perpignan, FR","zeit":"2026-10-06T06:10:00+02:00","eta":"2026-10-08T10:00:00+02:00"}
{"sendungsnr":"EVS-88104588","status":"510","statustext":"Unterwegs","ort":"La Jonquera, ES","zeit":"2026-10-06T13:00:00+02:00","lat":42.42,"lon":2.87,"eta":"2026-10-08T11:00:00+02:00"}
```

| Code and text          | Canonical                                      |
| ---------------------- | ---------------------------------------------- |
| `300 Abgeholt`         | `PICKED_UP`                                    |
| `400 Umschlag Eingang` | `HUB_IN` at `ort`                              |
| `410 Umschlag Ausgang` | `HUB_OUT` at `ort`                             |
| `510 Unterwegs`        | `position`                                     |
| `600 In Zustellung`    | `OUT_FOR_DELIVERY`                             |
| `700 Zugestellt`       | `DELIVERED`                                    |
| any other code         | `note` (`statustext` and `bemerkung` verbatim) |

An `eta` field, when present, additionally yields an estimate for `DELIVERED` (minute precision).
`bemerkung` (remark) is optional free text.

### 3.3 Noray Lines (`NRY`), ocean carrier

Valencia (`ESVLC`) to Veracruz (`MXVER`), weekly Friday sailings, 14 days. Channel `api` (polled),
DCSA-style JSON. Equipment events carry the container; transport events are **vessel-level** and
carry vessel and voyage only.

```json
{"eventType":"EQUIPMENT","equipmentEventTypeCode":"GTIN","eventClassifierCode":"ACT","emptyIndicatorCode":"LADEN","eventDateTime":"2026-09-22T08:31:00+02:00","UNLocationCode":"ESVLC","equipmentReference":"NRYU4821373"}
{"eventType":"TRANSPORT","transportEventTypeCode":"ARRI","eventClassifierCode":"EST","eventDateTime":"2026-10-09T06:00:00-06:00","UNLocationCode":"MXVER","vesselName":"NORAY ALTAIR","carrierVoyageNumber":"612W"}
```

| Event                                                    | Canonical                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `EQUIPMENT GTIN ACT LADEN` at the origin port            | `GATE_IN`                                                                                        |
| `EQUIPMENT LOAD ACT`                                     | `LOADED`                                                                                         |
| `EQUIPMENT DISC ACT`                                     | `DISCHARGED`                                                                                     |
| `EQUIPMENT GTOT ACT LADEN` at the destination port       | `GATE_OUT`                                                                                       |
| `TRANSPORT DEPA ACT`                                     | `VESSEL_DEPARTED` (fan-out by vessel + voyage)                                                   |
| `TRANSPORT ARRI ACT`                                     | `VESSEL_ARRIVED` (fan-out)                                                                       |
| `TRANSPORT ARRI EST`                                     | estimate for `VESSEL_ARRIVED` (fan-out); `delayReasonCode` and `changeRemark` kept as the remark |
| classifier `PLN`, `EMPTY` equipment moves, anything else | ignored or `note`                                                                                |

Only `ACT` creates a milestone. The same code means different things depending on empty/laden and
facility: key on all three.

### 3.4 Turia Global Forwarding (`TGF`), forwarder

On every sea file: export clearance in Valencia, coordination of import clearance through its
Veracruz agent (who acts as the consignee's customs broker: shipments are DAP, the consignee is the
importer of record), and door delivery in Mexico. Two channels:

**(a) Daily status report**, channel `report`, 08:30 Madrid, semicolon rows, Spanish, day precision.
Rule-mapped facts.

```text
expediente;ref_cliente;concepto;estado;fecha;observaciones
TGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;23/09/2026;MRN 26ES00461130047821
TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;
TGF-26-03290;48176;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;
TGF-26-03290;48176;ENTREGA;ETA PENDIENTE;;Pendiente de aduana
```

| `concepto` / `estado`                           | Canonical                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `DESPACHO EXPORTACION` / `LEVANTE`              | `EXPORT_RELEASED`                                                        |
| `DESPACHO IMPORTACION` / `PEDIMENTO PRESENTADO` | `IMPORT_LODGED`                                                          |
| `DESPACHO IMPORTACION` / `DESADUANADO`          | `IMPORT_RELEASED`, and clears an open customs hold                       |
| `ENTREGA` / `ETA`                               | estimate for `DELIVERED`, day precision (`observaciones` kept as remark) |
| `ENTREGA` / `ETA PENDIENTE`                     | estimate for `DELIVERED` withdrawn                                       |
| `ENTREGA` / `ENTREGADO`                         | `DELIVERED`, day precision                                               |
| `DOCUMENTO` / `BL EMITIDO`                      | document received: bill of lading                                        |
| anything else                                   | `note`                                                                   |

**(b) Emails**, channel `email`, free text in Spanish. This is the one source read by a model: the
adapter hands the text to the `TextInterpreter` port and the result is an AI reading that a person
must confirm (domain spec §4). The dataset contains exactly one such email at T0 (EST-4012's hold).

```text
De: operaciones@turiaglobal.example
Asunto: Exp. TGF-26-03290 / OC 48176 - Reconocimiento aduanero
Nos informa nuestro agente en Veracruz: el pedimento salió en semáforo rojo. En el reconocimiento, la
aduana detecta discrepancia de peso bruto entre la factura comercial (4.180 kg) y el BL (4.810 kg).
La mercancía queda retenida hasta presentar factura rectificada. El plazo libre en terminal vence el
viernes 9.
```

Expected reading: hold `customs` raised; reason "Customs found a gross-weight discrepancy between the
commercial invoice (4,180 kg) and the bill of lading (4,810 kg); a corrected invoice is required."

## 4. Accounts and personas

| Code  | Account                            | Type       | Country | Consignees                                            |
| ----- | ---------------------------------- | ---------- | ------- | ----------------------------------------------------- |
| `AQB` | Aquabajío Ingeniería, S.A. de C.V. | customer   | Mexico  | Querétaro plant; PTAR San Juan del Río (project site) |
| `VAU` | Vauclair Hydraulique SAS           | customer   | France  | Saint-Priest HQ (Lyon); Colomiers depot (Toulouse)    |
| `IDE` | Ibón Deutschland GmbH              | subsidiary | Germany | Mannheim warehouse                                    |
| `THA` | Riegos Thader, S.L.                | customer   | Spain   | Murcia warehouse; El Ejido site (Almería)             |
| `HIS` | Hispalagua Servicios, S.A.         | customer   | Spain   | Sevilla depot; EDAR project site, Málaga              |

A subsidiary is an account like any other; the type is a label.

| Persona                                               | Side and role                | Perimeter                          | Sees at T0                                                                                                                              |
| ----------------------------------------------------- | ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Marta Soler**, Logistics Operations Lead (default)  | internal, `logistics`        | all sites, all accounts            | 23 shipments, 6 need attention                                                                                                          |
| **Iker Zabala**, Shipping Coordinator, Abadiño plant  | internal, `logistics`        | site `BIO`                         | 5 shipments, 1 needs attention (EST-4012)                                                                                               |
| **Lucía Ferrer**, Customer Support, key accounts      | internal, `customer_support` | accounts `AQB` and `VAU`, any site | 13 shipments, 3 need attention (EST-4134, EST-4116, EST-4012); she can send customer notices, the other steps are disabled for her role |
| **Mariana Olvera**, Purchasing Coordinator, Aquabajío | external                     | account `AQB`                      | 8 shipments                                                                                                                             |
| **Camille Roussel**, Supply Manager, Vauclair         | external                     | account `VAU`                      | 5 shipments                                                                                                                             |

## 5. Sailings (Noray Lines, Valencia → Veracruz)

| Vessel and voyage | Departs Valencia          | Veracruz                                                             | Our shipments                |
| ----------------- | ------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| NORAY VEGA 610W   | Fri 11 Sep 21:10 (actual) | Fri 25 Sep 05:50 (actual)                                            | EST-4019                     |
| NORAY CASTOR 611W | Fri 18 Sep 20:55 (actual) | Fri 2 Oct 05:40 (actual)                                             | EST-4012, EST-4033, EST-4036 |
| NORAY ALTAIR 612W | Fri 25 Sep 21:40 (actual) | Fri 9 Oct 06:00 (operator estimate, received Mon 5 Oct 07:00 Madrid) | EST-4058, EST-4063           |
| NORAY DENEB 614W  | Fri 9 Oct 20:00 (planned) | Fri 23 Oct 06:00 (planned)                                           | EST-4116, EST-4122           |

Export clearance cut-off for NORAY DENEB 614W: **Thu 8 Oct 12:00 Madrid** (T0 + 20 h). The next
sailing is a week later (Fri 16 Oct).

Ocean lane plan, relative to the sailing Friday `S` (Madrid) and the arrival Friday `A = S + 14 d`
(Veracruz): booked `S − 9 d`; picked up Mon `S − 4 d` afternoon (Tue `S − 3 d` morning from the
Riba-roja warehouse); gate-in Tue `S − 3 d`; export released Wed `S − 2 d` (day precision); loaded
Fri `S` early morning; vessel departed Fri `S` evening; vessel arrived Fri `A` 06:00; discharged Sat
`A + 1 d`; import entry lodged Mon `A + 3 d` (day); import released Tue `A + 4 d` (day); gate-out Tue
`A + 4 d` 15:00; delivered Wed `A + 5 d` (day precision, reported by Turia).

## 6. Shipment roster (23)

`Stage`, `Health` and the customer verdict are **never authored**: the seed stores the plan, the raw
events and the documents; these columns are the expected output of the pure functions and are
asserted by a golden test.

### Ocean, Valencia → Veracruz (account AQB, incoterm DAP)

| Ref      | Order     | Site | Consignee             | Cargo                                                           | Voyage      | Committed  | Expected at T0                                                                                                                   |
| -------- | --------- | ---- | --------------------- | --------------------------------------------------------------- | ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| EST-4012 | 48176     | BIO  | Querétaro plant       | 1×20', 14 crates VB valves, 4,810 kg, container NRYU3055186     | CASTOR 611W | Fri 9 Oct  | At destination port, import gate held. **Held** (customs hold from an unconfirmed AI reading). Operator door estimate withdrawn. |
| EST-4019 | 48190     | ZAZ  | PTAR San Juan del Río | 1×40'HC, 2 BS-4 booster skids, 9,600 kg                         | VEGA 610W   | Fri 2 Oct  | **Delivered** Thu 1 Oct. Proof of delivery on file.                                                                              |
| EST-4033 | 48197     | VLC  | Querétaro plant       | 1×20', 10 pallets LN 80 pumps, 6,300 kg                         | CASTOR 611W | Mon 12 Oct | At destination port, import entry lodged Tue 6 Oct. Operator door estimate Fri 9 Oct. **On time.**                               |
| EST-4036 | 48198     | VLC  | Querétaro plant       | 1×20', 10 crates SR pumps, 5,150 kg                             | CASTOR 611W | Thu 8 Oct  | On final leg (gate-out Tue 6 Oct 12:00 Veracruz). Operator door estimate Wed 7 Oct. **On time.**                                 |
| EST-4058 | **12345** | ZAZ  | Querétaro plant       | 1×40'HC, 3 MV 150 pump sets, 11,200 kg, container NRYU4821373   | ALTAIR 612W | Thu 15 Oct | At sea. Operator door estimate Wed 14 Oct. **On time** until demo event A.                                                       |
| EST-4063 | 48221     | VLC  | PTAR San Juan del Río | 1×20', 9 crates VB valves, 3,900 kg                             | ALTAIR 612W | Tue 20 Oct | At sea. Operator door estimate Wed 14 Oct. **On time**, and still on time after event A.                                         |
| EST-4116 | 48236     | VLC  | Querétaro plant       | 1×20', 11 pallets seal kits, 4,200 kg                           | DENEB 614W  | Fri 30 Oct | At origin port (gate-in Tue 6 Oct). Commercial invoice missing. **At risk** (`cutoff_risk`). Operator door estimate Wed 28 Oct.  |
| EST-4122 | 48244     | ZAZ  | Querétaro plant       | 1×40'HC, 2 BS-6 booster skids, 10,300 kg, container NRYU5172643 | DENEB 614W  | Fri 30 Oct | In transit (picked up Wed 7 Oct 11:00). **On time.**                                                                             |

### Domestic road (Transportes Cierzo, incoterm DAP)

| Ref      | Order | Site | Consignee (account)             | Cargo                            | Committed  | Expected at T0                                                                                               |
| -------- | ----- | ---- | ------------------------------- | -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| EST-4120 | 15338 | BIO  | Sevilla depot (HIS)             | 6 pallets VB valves, 2,300 kg    | Tue 6 Oct  | **Delivered** Tue 6 Oct 10:22. Proof of delivery on file.                                                    |
| EST-4128 | 20561 | ZAZ  | Murcia warehouse (THA)          | 5 pallets LN 100 pumps, 1,850 kg | Tue 6 Oct  | In transit (back at the Zaragoza platform after a breakdown). Operator door estimate Thu 8 Oct. **Delayed.** |
| EST-4131 | 15346 | VLC  | EDAR project site, Málaga (HIS) | 4 pallets SR pumps, 1,420 kg     | Wed 7 Oct  | In transit (at the Málaga platform). **Held** (carrier hold: damage).                                        |
| EST-4133 | 15347 | ZAZ  | Sevilla depot (HIS)             | 3 pallets spare kits, 640 kg     | Wed 7 Oct  | **Delivered** Wed 7 Oct 12:05. Proof of delivery pending.                                                    |
| EST-4141 | 20570 | BIO  | Murcia warehouse (THA)          | 8 pallets VB valves, 3,100 kg    | Thu 8 Oct  | In transit (picked up Tue 6 Oct 17:00). No operator estimate; planned Thu 8 Oct. **On time.**                |
| EST-4147 | 20574 | VLC  | El Ejido site (THA)             | 10 pallets LN 65 pumps, 2,750 kg | Tue 13 Oct | Booked (pickup planned Thu 8 Oct). **On time.**                                                              |

### EU road, full loads (Eisvogel, own fleet, telematics)

| Ref      | Order | Site | Consignee (account)      | Cargo                          | Incoterm | Committed | Expected at T0                                                                                                         |
| -------- | ----- | ---- | ------------------------ | ------------------------------ | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| EST-4107 | 61877 | ZAZ  | Mannheim warehouse (IDE) | 22 pallets LN pumps, 13,800 kg | DAP      | Mon 5 Oct | **Delivered** Mon 5 Oct 08:50. Signed CMR on file.                                                                     |
| EST-4111 | 61880 | VLC  | Mannheim warehouse (IDE) | 18 pallets spares, 9,200 kg    | DAP      | Tue 6 Oct | **Delivered** Tue 6 Oct 15:10. Signed CMR pending.                                                                     |
| EST-4115 | 71204 | ZAZ  | Saint-Priest HQ (VAU)    | 20 pallets MV pumps, 12,100 kg | CPT      | Tue 6 Oct | **Delivered** Tue 6 Oct 09:40. Signed CMR on file.                                                                     |
| EST-4127 | 61893 | ZAZ  | Mannheim warehouse (IDE) | 24 pallets MV pumps, 14,600 kg | DAP      | Thu 8 Oct | In transit; last position La Jonquera, Tue 6 Oct 13:00. **Stale** (27 h without a position). Estela estimate withheld. |
| EST-4140 | 71222 | ZAZ  | Saint-Priest HQ (VAU)    | 21 pallets LN pumps, 12,900 kg | CPT      | Thu 8 Oct | In transit; last position Nîmes, Wed 7 Oct 15:35. Operator estimate Thu 8 Oct 08:30. **On time.**                      |

### EU road, groupage (Eisvogel network, hub scans, no telematics)

| Ref      | Order | Site | Consignee (account)      | Cargo                         | Incoterm | Committed  | Expected at T0                                                                                                                                                                           |
| -------- | ----- | ---- | ------------------------ | ----------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EST-4134 | 71219 | VLC  | Saint-Priest HQ (VAU)    | 7 pallets VB valves, 2,650 kg | CPT      | Thu 8 Oct  | In transit; in the Perpignan hub since Tue 6 Oct 06:10, departure scan overdue. Operator estimate Thu 8 Oct 10:00. Estela estimate Fri 9 Oct. **At risk** (`predicted_delay`, inferred). |
| EST-4136 | 61899 | BIO  | Mannheim warehouse (IDE) | 9 pallets VG valves, 3,300 kg | DAP      | Mon 12 Oct | In transit; into the Lyon hub Wed 7 Oct 03:20. Operator estimate Fri 9 Oct 11:00. **On time.**                                                                                           |
| EST-4143 | 71225 | ZAZ  | Colomiers depot (VAU)    | 6 pallets MV pumps, 2,200 kg  | CPT      | Wed 7 Oct  | Out for delivery since Wed 7 Oct 14:10. Operator estimate Wed 7 Oct 17:00. **On time.**                                                                                                  |
| EST-4149 | 71231 | BIO  | Saint-Priest HQ (VAU)    | 5 pallets VG valves, 1,900 kg | CPT      | Wed 14 Oct | Booked (pickup planned Thu 8 Oct). **On time.**                                                                                                                                          |

Totals at T0: 1 delayed, 2 held, 2 at risk, 1 stale, 11 on time, 6 delivered. By site: ZAZ 10, VLC 8,
BIO 5. By account: AQB 8, VAU 5, IDE 4, THA 3, HIS 3.

**Queue at T0, in order** (Marta):

| #   | Ref      | Health  | Clock                                                                          | Why                                                                                                                                                   | Steps                                             |
| --- | -------- | ------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | EST-4128 | Delayed | Now: customer not yet told                                                     | Cierzo declares delivery Thu 8 Oct, two days after the committed Tue 6 Oct (truck breakdown near Teruel).                                             | notify customer                                   |
| 2   | EST-4134 | At risk | Act within 4 h: next linehaul leaves Perpignan Wed 7 Oct 20:00                 | In the Perpignan hub since Tue 06:10; the departure scan planned for Tue 20:00 never came. Eisvogel still says Thu 8 Oct; Estela estimates Fri 9 Oct. | contact operator → notify customer                |
| 3   | EST-4131 | Held    | Act within 15 h: tomorrow's first delivery round leaves Málaga Thu 8 Oct 07:00 | Cierzo holds the goods at its Málaga platform: 1 package damaged, awaiting instructions. Committed today.                                             | contact operator → notify customer                |
| 4   | EST-4116 | At risk | Cut-off in 20 h: export clearance for NORAY DENEB 614W, Thu 8 Oct 12:00        | Commercial invoice not on file, so Turia cannot lodge the export declaration. Missing this sailing costs 7 days.                                      | send document                                     |
| 5   | EST-4012 | Held    | Free time ends Fri 9 Oct: demurrage starts                                     | Read by AI from Turia's email: customs found a weight discrepancy between invoice and bill of lading; a corrected invoice is required.                | confirm reading → send document → notify customer |
| 6   | EST-4127 | Stale   | no clock                                                                       | No position from Eisvogel for 27 h on a truck that reports every 30 min.                                                                              | contact operator                                  |

## 7. Hero shipments, event by event

Only these are written by hand. The other shipments come from lane builders that apply the lane plan
to each row's dates and emit raw events in the operator's own format (including a realistic number of
Eisvogel positions for full loads).

### EST-4058 · order 12345 · Zaragoza → Querétaro (the port-incident hero)

References: `CRZ-2290311`; Noray booking `NRY4471903`; container `NRYU4821373`; bill of lading
`NRYVLC4471903`; Turia file `TGF-26-03412`. Committed Thu 15 Oct.

| When (local)                      | Source     | Raw                                                                                 | Canonical                                             |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Wed 16 Sep 10:12                  | IBON       | transport order confirmed                                                           | `BOOKED`                                              |
| Mon 21 Sep 15:10                  | CRZ        | `CRZ-2290311;10;RECOGIDA EFECTUADA;ZARAGOZA;21/09/2026 15:10;`                      | `PICKED_UP`                                           |
| Tue 22 Sep 08:25                  | CRZ        | `CRZ-2290311;60;ENTRADA EN TERMINAL;VALENCIA;22/09/2026 08:25;`                     | `GATE_IN`                                             |
| Tue 22 Sep 08:31                  | NRY        | `EQUIPMENT GTIN ACT LADEN ESVLC NRYU4821373`                                        | same milestone, merged: 2 sources, Noray's time shown |
| Wed 23 Sep                        | TGF report | `TGF-26-03412;12345;DESPACHO EXPORTACION;LEVANTE;23/09/2026;MRN 26ES00461130047821` | `EXPORT_RELEASED` (day)                               |
| Fri 25 Sep 03:10                  | NRY        | `EQUIPMENT LOAD ACT ESVLC`                                                          | `LOADED`                                              |
| Fri 25 Sep 21:40                  | NRY        | `TRANSPORT DEPA ACT ESVLC NORAY ALTAIR 612W`                                        | `VESSEL_DEPARTED` (vessel-level)                      |
| Mon 28 Sep                        | TGF report | `TGF-26-03412;12345;DOCUMENTO;BL EMITIDO;28/09/2026;`                               | bill of lading on file                                |
| Mon 5 Oct 07:00 Madrid (received) | NRY        | `TRANSPORT ARRI EST MXVER 2026-10-09T06:00-06:00`                                   | operator estimate, vessel arrival Fri 9 Oct 06:00     |
| Tue 6 Oct 08:30 Madrid (received) | TGF report | `TGF-26-03412;12345;ENTREGA;ETA;14/10/2026;`                                        | operator estimate, delivery Wed 14 Oct                |

Plan ahead: discharged Sat 10 Oct 10:00; import lodged Mon 12 Oct; import released Tue 13 Oct;
gate-out Tue 13 Oct 15:00; delivered Wed 14 Oct. Estela's estimate at T0 agrees with the operator.

**After demo event A** the vessel is due Sun 11 Oct 08:00. Expected: Estela estimate **Fri 16 Oct**
(window Fri 16 – Mon 19 Oct), one day after the committed date, two days later than planned; the
operator's Wed 14 Oct is superseded ("declared Tue 6 Oct, before the vessel delay"); health **At
risk**, basis declared; step: notify customer. EST-4063, on the same vessel, moves to Fri 16 Oct too
but stays inside its committed Tue 20 Oct: no exception. **After event B** Turia declares Fri 16 Oct:
the same date now reads `Operator estimate`, health becomes **Delayed**, and no second notice is
proposed if one was already sent with that date.

### EST-4012 · order 48176 · Abadiño → Querétaro (the customs-hold hero)

References: `CRZ-2287764`; booking `NRY4468217`; container `NRYU3055186`; Turia file `TGF-26-03290`.
Committed Fri 9 Oct. Deadline: free time at the Veracruz terminal ends Fri 9 Oct 23:59 local
("Free time ends: demurrage starts").

| When (local)                      | Source     | Raw                                                              | Canonical                                |
| --------------------------------- | ---------- | ---------------------------------------------------------------- | ---------------------------------------- |
| Wed 9 Sep 09:40                   | IBON       | transport order confirmed                                        | `BOOKED`                                 |
| Mon 14 Sep 09:30                  | CRZ        | `…;10;RECOGIDA EFECTUADA;ABADIÑO;…`                              | `PICKED_UP`                              |
| Tue 15 Sep 07:50 / 07:58          | CRZ, NRY   | `…;60;ENTRADA EN TERMINAL;VALENCIA;…` and `GTIN ACT LADEN ESVLC` | `GATE_IN` (merged)                       |
| Wed 16 Sep                        | TGF report | `…;DESPACHO EXPORTACION;LEVANTE;16/09/2026;…`                    | `EXPORT_RELEASED`                        |
| Fri 18 Sep 02:20, 20:55           | NRY        | `LOAD ACT`; `TRANSPORT DEPA ACT … NORAY CASTOR 611W`             | `LOADED`; `VESSEL_DEPARTED`              |
| Fri 2 Oct 05:40; Sat 3 Oct 09:15  | NRY        | `TRANSPORT ARRI ACT MXVER`; `DISC ACT MXVER`                     | `VESSEL_ARRIVED`; `DISCHARGED`           |
| Mon 5 Oct 08:30 Madrid (received) | TGF report | `…;ENTREGA;ETA;07/10/2026;`                                      | operator estimate, delivery Wed 7 Oct    |
| Tue 6 Oct 08:30 Madrid (received) | TGF report | `…;DESPACHO IMPORTACION;PEDIMENTO PRESENTADO;05/10/2026;`        | `IMPORT_LODGED` Mon 5 Oct                |
| Tue 6 Oct 17:55 Madrid (received) | TGF email  | the email in §3.4                                                | AI reading, pending: customs hold raised |
| Wed 7 Oct 08:30 Madrid (received) | TGF report | `…;ENTREGA;ETA PENDIENTE;;Pendiente de aduana`                   | operator door estimate withdrawn         |

Documents on file: commercial invoice, packing list, export declaration, bill of lading. Estela's
estimate while the hold is open is conditional: **Fri 9 Oct** (window Fri 9 – Mon 12 Oct), "if the
corrected invoice reaches the broker today". **After the reader confirms the reading and sends the
corrected invoice**, the case waits on customs. **Demo event C** then releases it: import released
Wed 7 Oct, operator door estimate Fri 9 Oct, hold cleared, health On time.

### EST-4134 · order 71219 · Riba-roja → Saint-Priest (predicted late, inferred)

Reference `EVS-88104652`. Committed Thu 8 Oct. Deadline: next linehaul leaves the Perpignan hub
Wed 7 Oct 20:00 (`next_departure`, attached to the Perpignan `HUB_OUT`).

| When (local)           | Source | Raw                                                      | Canonical                          |
| ---------------------- | ------ | -------------------------------------------------------- | ---------------------------------- |
| Thu 1 Oct 11:05        | IBON   | transport order confirmed                                | `BOOKED`                           |
| Mon 5 Oct 15:05        | EVS    | `300 Abgeholt`, Riba-roja de Túria, eta Thu 8 Oct 10:00  | `PICKED_UP`; operator estimate     |
| Mon 5 Oct 18:30, 22:10 | EVS    | `400 Umschlag Eingang`, `410 Umschlag Ausgang`, Valencia | `HUB_IN`, `HUB_OUT` (origin depot) |
| Tue 6 Oct 06:10        | EVS    | `400 Umschlag Eingang`, Perpignan, eta Thu 8 Oct 10:00   | `HUB_IN` (transit hub)             |
| Tue 6 Oct 20:00        | plan   | departure scan expected, never received                  | nothing: the absence is the signal |

Plan ahead: out for delivery Thu 8 Oct 07:00; delivered Thu 8 Oct 10:00. Estela's estimate: the hub
departure is overdue, so the chain restarts at the next linehaul (Wed 20:00): out for delivery Fri 9
Oct 07:00, delivered **Fri 9 Oct**.

### Other shipments that carry a story (written by hand where the builder cannot express it)

- **EST-4128** (`CRZ-2291188`): `10` Mon 5 Oct 16:00 Zaragoza; `50 INCIDENCIA;TERUEL;06/10/2026
02:50;AVERÍA VEHÍCULO TRACTOR A-23. MERCANCÍA SIN DAÑOS` (note); `25 LLEGADA A PLATAFORMA;ZARAGOZA;
06/10/2026 11:30` (unplanned hub); `50 INCIDENCIA;ZARAGOZA;06/10/2026 12:10;NUEVA ENTREGA PREVISTA
08/10` (operator estimate Thu 8 Oct).
- **EST-4131** (`CRZ-2291274`): `10` Mon 5 Oct 17:20 Riba-roja; `25 LLEGADA A PLATAFORMA;MÁLAGA;
07/10/2026 04:40`; `50 INCIDENCIA;MÁLAGA;07/10/2026 05:10;1 BULTO DAÑADO EN PLATAFORMA. MERCANCÍA
RETENIDA A LA ESPERA DE INSTRUCCIONES` (carrier hold; English reason "1 package damaged at the
  platform; goods held awaiting instructions"). Deadline `next_departure`: Thu 8 Oct 07:00, "Tomorrow's
  first delivery round leaves the Málaga platform".
- **EST-4127** (`EVS-88104588`): `300` Mon 5 Oct 14:00 Zaragoza; positions every 30 min while driving
  until La Jonquera, Tue 6 Oct 13:00, each with eta Thu 8 Oct 11:00; then silence.
- **EST-4116** (Turia file `TGF-26-03455`): gate-in Tue 6 Oct 11:05 (CRZ) and 11:12 (NRY); packing
  list on file; commercial invoice missing; deadline `export_cutoff` Thu 8 Oct 12:00 Madrid with
  consequence "Missing NORAY DENEB means the next sailing, Fri 16 Oct: 7 days later".
- **EST-4036**: gate-out (`GTOT`, Tue 6 Oct 12:00 Veracruz) reaches us in real time, while its import
  release (Tue 6 Oct) only arrives in Turia's report the next morning: the fold must cope with that
  order.
- **EST-4133**: delivered with `FIRMADO: ALMACÉN. SIN RESERVAS`.

Container numbers must carry a valid ISO 6346 check digit (the three above do). Give the other ocean
shipments Noray-prefixed numbers with valid check digits and assert validity in a fixtures test.

## 8. Demo events (the scripted live feed)

No timer. The demo bar sends them one at a time; each names what it sends. A precondition disables an
event until it holds. Payload times are resolved at send time (`now`).

| Id  | Label in the demo bar                                    | Payload                                                                                                                                                                                                                                                                                                                                              | Precondition                              | Expected effect                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A` | Noray Lines · NORAY ALTAIR delayed at Veracruz           | `{"eventType":"TRANSPORT","transportEventTypeCode":"ARRI","eventClassifierCode":"EST","eventDateTime":"2026-10-11T08:00:00-06:00","UNLocationCode":"MXVER","vesselName":"NORAY ALTAIR","carrierVoyageNumber":"612W","delayReasonCode":"WEA","changeRemark":"Port closed to navigation by harbour master: norther, gusts 45 kn. Berth window lost."}` | none                                      | Fans out to EST-4058 and EST-4063. EST-4058 enters the queue At risk; EST-4063 only changes date. Feed notice: "Noray Lines: NORAY ALTAIR now due in Veracruz Sun 11 Oct, 2 days later (port closed, weather). 2 shipments affected, 1 needs a customer notice." |
| `B` | Turia Global Forwarding · confirms the new delivery date | report rows `TGF-26-03412;12345;ENTREGA;ETA;16/10/2026;Atraque NORAY ALTAIR previsto 11/10 por cierre del puerto` and the same for EST-4063 (`TGF-26-03418;48221;…`)                                                                                                                                                                                 | `A` sent                                  | EST-4058: the date flips from Estela estimate to Operator estimate; health Delayed; no second notice if one was sent with Fri 16 Oct.                                                                                                                            |
| `C` | Turia Global Forwarding · customs release, EST-4012      | report rows `TGF-26-03290;48176;DESPACHO IMPORTACION;DESADUANADO;07/10/2026;Factura rectificada aceptada` and `TGF-26-03290;48176;ENTREGA;ETA;09/10/2026;`                                                                                                                                                                                           | a corrected invoice was sent for EST-4012 | Hold cleared; EST-4012 leaves the queue: "Resolved by operator update".                                                                                                                                                                                          |
| `D` | Eisvogel Spedition · position signal back, EST-4127      | `{"sendungsnr":"EVS-88104588","status":"510","statustext":"Unterwegs","ort":"Besançon, FR","zeit":"<now>","eta":"2026-10-08T11:00:00+02:00","bemerkung":"Telematik-Störung behoben"}`                                                                                                                                                                | none                                      | Stale clears; EST-4127 leaves the queue.                                                                                                                                                                                                                         |

## 9. Content for the AI outputs (mock adapters must produce this from the data, not from literals)

**Briefing, Marta at T0.** Counts are computed: "6 need you: 1 delayed, 2 held, 2 at risk, 1 stale.
11 on plan. 4 delivered since yesterday." The one generated sentence (marked as written by AI):
"Where acting today changes the outcome: EST-4134 can still make tonight's 20:00 linehaul from
Perpignan, and EST-4116 needs its commercial invoice before tomorrow's 12:00 export cut-off or it
sails a week later." It is composed from the two nearest deadline-bound cases in the actor's queue.

**Estela estimate, the chain shown under "Why" (EST-4058 after event A):**

> Delivery estimate Fri 16 Oct (was Wed 14 Oct). Vessel berths Sun 11 Oct, declared by Noray Lines
> today. Discharge Mon 12 Oct. Import clearance one to two working days. Gate-out Thu 15 Oct. Truck to
> Querétaro, one day. Firms up when the vessel berths.

No percentages anywhere: the estimator is rule-based and says so ("Rule-based estimate"). It gives a
day, a window and its steps, or it withholds: "No estimate: no position from Eisvogel Spedition for
27 h."

**Customer notice drafts** (English; the customer is the importer under DAP, so never "you do not
need to do anything" on an import matter; no fault or liability wording):

- EST-4058 after A — subject "Order 12345: new delivery estimate, Fri 16 Oct". Body: "The port of
  Veracruz is closed to navigation because of bad weather, so the vessel carrying your shipment is
  now due to berth on Sun 11 Oct instead of Fri 9 Oct. We estimate delivery in Querétaro on Fri 16
  Oct, two days later than planned. This is our own estimate; we will confirm it as soon as the
  forwarder does. If you have booked a receiving slot for Wed 14 Oct, please move it."
- EST-4128 — subject "Order 20561: delivery moved to Thu 8 Oct". Body: "The truck carrying your
  shipment broke down on Tuesday night. The goods were not damaged and have been reloaded. The carrier
  now plans delivery in Murcia on Thu 8 Oct, two days later than committed."
- EST-4012 — subject "Order 48176: held at Veracruz customs for a document check". Body: "Customs
  found that the gross weight on the commercial invoice (4,180 kg) does not match the bill of lading
  (4,810 kg). We have sent a corrected invoice to the broker today. If customs releases the shipment
  tomorrow, delivery in Querétaro stays on Fri 9 Oct; we will confirm as soon as we hear. Your broker
  may be asked to present the corrected invoice."
- EST-4134 — subject "Order 71219: possible one-day delay". Body: "Your shipment has stayed at our
  carrier's Perpignan hub longer than planned and may have missed its departure. The carrier still
  announces delivery on Thu 8 Oct; our own estimate is Fri 9 Oct. We are checking with the carrier
  and will confirm today."
- EST-4131 — subject "Order 15346: delivery on hold". Body: "The carrier has reported damage to one
  of the four pallets at its Málaga platform. We have asked for the three intact pallets to be
  delivered on tomorrow's first round, Thu 8 Oct, and will confirm the plan for the fourth today."

**Messages to operators** (English): EST-4134 → Eisvogel, "EVS-88104652: departure from Perpignan?";
EST-4127 → Eisvogel, "EVS-88104588: position and ETA"; EST-4131 → Cierzo, "CRZ-2291274: release the
intact pallets, photos of the damage"; EST-4012 → Turia, "TGF-26-03290 / OC 48176: corrected
commercial invoice" (attachment: `commercial-invoice-48176-rev2.pdf`); EST-4116 → Turia,
"TGF-26-03455 / OC 48236: commercial invoice for export clearance" (attachment:
`commercial-invoice-48236.pdf`). Each states the reference, what we observed with its time, and the
one thing we ask for.

**Natural-language queries** (cases stored as data; they become the evaluation set):

| #   | Query                                      | Interpretation                                                                | Result at T0 (Marta)                                                                                                                                                                                         |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | shipments to France this week running late | destination FR; due this week (Mon 5 – Sun 11 Oct); health Delayed or At risk | EST-4134                                                                                                                                                                                                     |
| 2   | what's going on with order 12345?          | lookup by order → EST-4058, answered with a status line                       | "At sea on NORAY ALTAIR 612W, due in Veracruz Fri 9 Oct (operator estimate, Noray Lines). Delivery in Querétaro Wed 14 Oct (operator estimate, Turia Global Forwarding), one day inside the committed date." |
| 3   | anything stuck in customs?                 | customs hold                                                                  | EST-4012                                                                                                                                                                                                     |
| 4   | open shipments from Bilbao                 | origin site BIO ("Bilbao" and "Abadiño" are aliases); not delivered           | EST-4012, EST-4136, EST-4141, EST-4149                                                                                                                                                                       |
| 5   | what's on the Noray Altair?                | vessel NORAY ALTAIR                                                           | EST-4058, EST-4063                                                                                                                                                                                           |
| 6   | late deliveries for Vauclair               | account VAU; health Delayed or At risk                                        | EST-4134                                                                                                                                                                                                     |
| 7   | urgent shipments to Germany                | destination DE; **not used: "urgent"**                                        | EST-4127, EST-4136 (not delivered) plus delivered ones unless filtered: the chip row shows what was applied                                                                                                  |
| 8   | how much duty did we pay on order 48190?   | unsupported: duty is not in the record                                        | "Estela holds tracking and documents, not duty amounts. Order 48190 is EST-4019, delivered Thu 1 Oct."                                                                                                       |
| 9   | asdf qwerty                                | not understood                                                                | falls back to a plain text match and says so                                                                                                                                                                 |

## 10. Documents

Ocean: commercial invoice and packing list (Ibón, before export release), export declaration with its
MRN (Turia, at export release), bill of lading (Noray via Turia, after loading), proof of delivery
(after delivery). International road: CMR at pickup; the consignee-signed CMR comes back days later
as proof of delivery ("pending" is normal). Domestic road: delivery note at pickup; signed delivery
note as proof of delivery.

Exceptions to "complete for its stage": EST-4116 (commercial invoice missing, blocks export
clearance); EST-4111 and EST-4133 (proof of delivery pending: not an exception); EST-4147 and
EST-4149 (booked: nothing due yet).

Documents are metadata in the prototype. "Download" saves a small generated text file that says it is
a synthetic placeholder. Sending a document attaches a file name (the reader may pick any file or use
the suggested sample) to a message for the broker.
