import "server-only";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { boardState, describeException, EXCEPTION_LABELS } from "@/lib/supervisor/board";

import type { AuditPack, PackRecord, PackTask } from "./types";

const navy = "#0F243E";
const teal = "#009193";
const red = "#b91c1c";
const amber = "#b45309";
const green = "#15803d";
const grey = "#6b7280";

const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: navy, marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: navy, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: navy, marginBottom: 2 },
  muted: { color: grey },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d1d5db", paddingVertical: 3 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: navy, paddingBottom: 3 },
  cell: { paddingRight: 4 },
  box: { borderWidth: 1.5, borderRadius: 4, padding: 10, marginTop: 14 },
  task: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: teal },
  thumbs: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  thumb: { width: 72, marginRight: 6, marginBottom: 2 },
  thumbImg: { width: 72, height: 54, objectFit: "cover" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7.5,
    color: grey,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function siteTime(iso: string | null, tz: string, withDate = true): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: withDate ? "numeric" : undefined,
    month: withDate ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    second: withDate ? undefined : "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function Table({ cols, rows }: { cols: { label: string; width: string }[]; rows: React.ReactNode[][] }) {
  return (
    <View>
      <View style={s.head} fixed>
        {cols.map((c) => (
          <Text key={c.label} style={[s.cell, s.bold, { width: c.width }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row} wrap={false}>
          {r.map((cell, j) => (
            <View key={j} style={[s.cell, { width: cols[j].width }]}>
              {typeof cell === "string" || typeof cell === "number" ? <Text>{cell}</Text> : cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const RESULT = { done: "Done", skipped: "Skipped", failed: "Failed" } as const;

function NoteCell({ r }: { r: PackRecord }) {
  if (!r.noteOriginal) return null;
  return (
    <View>
      <Text>
        {r.noteLanguage ? `[${r.noteLanguage}] ` : ""}
        {r.noteOriginal}
      </Text>
      {r.noteEn ? (
        <Text style={{ color: teal, marginTop: 1 }}>
          EN ({r.noteEnSource === "human" ? "Supervisor-confirmed" : "AI-translated"}): {r.noteEn}
        </Text>
      ) : r.noteLanguage && r.noteLanguage !== "en" ? (
        <Text style={s.muted}>No English translation yet</Text>
      ) : null}
    </View>
  );
}

function TaskDetail({ task, pack }: { task: PackTask; pack: AuditPack }) {
  const tz = pack.site.timezone;
  const exceptions = pack.exceptions.filter((e) => e.taskId === task.id);
  return (
    <View style={s.task}>
      <View wrap={false} minPresenceAhead={80}>
        <Text style={s.h3}>
          {task.shiftDate} · {task.zoneName} · {task.recleanOfTaskId ? "Re-clean: " : ""}
          {task.equipmentName}
        </Text>
        <Text style={s.muted}>
          SSOP v{task.ssopVersion ?? "?"} · {task.records.length} record(s) for {task.stepCount} step(s) ·
          cleaner {task.assignedName ?? "unassigned"} · status {task.status.replaceAll("_", " ")}
          {exceptions.length ? ` · ${exceptions.length} exception(s)` : ""}
        </Text>
      </View>
      {task.records.length === 0 ? (
        <Text style={[s.muted, { marginTop: 3 }]}>No step records received.</Text>
      ) : (
        <Table
          cols={[
            { label: "Step", width: "17%" },
            { label: "Result", width: "11%" },
            { label: "Device / server time", width: "15%" },
            { label: "ATP / timer", width: "10%" },
            { label: "Note", width: "22%" },
            { label: "Photos (SHA-256)", width: "25%" },
          ]}
          rows={task.records.map((r) => [
            <Text key="step">
              {r.stepNo}. {r.stepTitle}
              {r.supersedesId ? " (correction)" : ""}
            </Text>,
            <View key="res">
              <Text style={{ color: r.result === "done" ? green : red, fontFamily: "Helvetica-Bold" }}>
                {RESULT[r.result]}
              </Text>
              {r.skipReason ? <Text>{r.skipReason.replaceAll("_", " ")}</Text> : null}
              <Text style={s.muted}>{r.cleaner}</Text>
            </View>,
            <View key="time">
              <Text>D {siteTime(r.deviceCompletedAt, tz)}</Text>
              <Text style={s.muted}>S {siteTime(r.serverReceivedAt, tz)}</Text>
            </View>,
            <View key="atp">
              {r.atpValue !== null ? (
                <Text style={r.atpLimit !== null && r.atpValue > r.atpLimit ? { color: red } : {}}>
                  ATP {r.atpValue}
                  {r.atpLimit !== null ? ` / ${r.atpLimit}` : ""}
                </Text>
              ) : null}
              {r.timerSeconds !== null ? <Text>Timer {r.timerSeconds}s</Text> : null}
            </View>,
            <NoteCell key="note" r={r} />,
            <View key="photos" style={s.thumbs}>
              {r.photos.map((p) => (
                <View key={p.path} style={s.thumb}>
                  {p.data && p.format ? (
                    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                    <Image style={s.thumbImg} src={{ data: p.data, format: p.format }} />
                  ) : null}
                  <Text style={{ fontSize: 7 }}>{p.sha256.slice(0, 12)}…</Text>
                </View>
              ))}
            </View>,
          ])}
        />
      )}
    </View>
  );
}

/** The audit pack PDF (SPEC F7). English only; no text from food safety standards. */
export function AuditPackDocument({ pack }: { pack: AuditPack }) {
  const tz = pack.site.timezone;
  const now = new Date(pack.generatedAt);
  const zoneName = new Map(pack.zones.map((z) => [z.id, z.name]));
  const shiftDate = new Map(pack.shifts.map((x) => [x.id, x.shiftDate]));
  const taskById = new Map(pack.tasks.map((t) => [t.id, t]));
  const chainOk = pack.chain.verified;

  const summaryRows: React.ReactNode[][] = [];
  for (const shift of pack.shifts) {
    for (const zone of pack.zones) {
      const tasks = pack.tasks.filter((t) => t.shiftId === shift.id && t.zoneId === zone.id);
      if (!tasks.length) continue;
      const ex = pack.exceptions.filter((e) => tasks.some((t) => t.id === e.taskId));
      const state = boardState(tasks, ex, shift.endsAt, now);
      const preop = pack.preops.filter((p) => p.shiftId === shift.id && p.zoneId === zone.id).at(-1);
      const release = pack.releases.filter((r) => r.shiftId === shift.id && r.zoneId === zone.id).at(-1);
      const colour = state.colour === "green" ? green : state.colour === "red" ? red : amber;
      summaryRows.push([
        shift.shiftDate,
        zone.name,
        <Text key="st" style={{ color: colour, fontFamily: "Helvetica-Bold" }}>
          {state.label}
        </Text>,
        `${state.done} / ${state.total}`,
        `${ex.length} (${ex.filter((e) => e.status === "open").length} open)`,
        preop ? (preop.result === "pass" ? "Passed" : "Failed") : "-",
        release
          ? `${release.decision === "released" ? "Released" : "Held"} ${siteTime(release.decidedAt, tz, false).slice(0, 5)} by ${release.by}${release.override ? " (override)" : ""}`
          : "-",
      ]);
    }
  }

  return (
    <Document
      title={`Audit pack ${pack.site.name} ${pack.filter.from} to ${pack.filter.to}`}
      author="ICA"
      creator="ICA"
    >
      <Page size="A4" style={s.page}>
        <Text style={{ color: teal, fontFamily: "Helvetica-Bold", marginBottom: 30 }}>
          INTELLIGENT CLEANING AUDIT
        </Text>
        <Text style={s.h1}>Sanitation audit pack</Text>
        <Text style={{ fontSize: 14, marginBottom: 16 }}>{pack.site.name}</Text>
        <Text>
          Period (shift dates): <Text style={s.bold}>{pack.filter.from}</Text> to{" "}
          <Text style={s.bold}>{pack.filter.to}</Text>
        </Text>
        <Text>Zones: {pack.zoneNames.join(", ") || "none"}</Text>
        <Text>
          Generated {siteTime(pack.generatedAt, tz)} ({tz}) by {pack.generatedBy}
        </Text>
        <Text style={s.muted}>
          {pack.shifts.length} shift(s) · {pack.tasks.length} task(s) ·{" "}
          {pack.tasks.reduce((n, t) => n + t.records.length, 0)} step record(s) · {pack.exceptions.length}{" "}
          exception(s)
        </Text>
        <View style={[s.box, { borderColor: chainOk ? green : red }]}>
          <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: chainOk ? green : red }}>
            {chainOk
              ? `Record integrity verified: ${pack.chain.records.toLocaleString("en-AU")} records, no breaks`
              : `Record integrity check FAILED: ${pack.chain.breaks} break(s), first at entry ${pack.chain.firstBreakSeq ?? "?"}`}
          </Text>
          <Text style={[s.muted, { marginTop: 4 }]}>
            Every record and change at this site is linked in a SHA-256 hash chain computed on the server. The
            whole chain for the site was re-checked when this pack was generated.
          </Text>
        </View>
        <Text style={[s.muted, { marginTop: 14 }]}>
          Times are shown in the site time zone. &quot;D&quot; is the time on the cleaner&apos;s device,
          &quot;S&quot; the time the server received the record. Notes are shown as written, with any English
          translation labelled.
        </Text>

        <Text style={s.h2}>Summary by shift and zone</Text>
        {summaryRows.length ? (
          <Table
            cols={[
              { label: "Shift", width: "12%" },
              { label: "Zone", width: "20%" },
              { label: "Status", width: "14%" },
              { label: "Tasks done", width: "10%" },
              { label: "Exceptions", width: "13%" },
              { label: "Pre-op", width: "9%" },
              { label: "Release", width: "22%" },
            ]}
            rows={summaryRows}
          />
        ) : (
          <Text style={s.muted}>No tasks in this period.</Text>
        )}
        <Footer pack={pack} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Task records</Text>
        {pack.tasks.length ? (
          pack.tasks.map((t) => <TaskDetail key={t.id} task={t} pack={pack} />)
        ) : (
          <Text style={s.muted}>No tasks.</Text>
        )}
        <Footer pack={pack} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Exceptions and resolutions</Text>
        {pack.exceptions.length ? (
          <Table
            cols={[
              { label: "Raised", width: "12%" },
              { label: "Equipment", width: "20%" },
              { label: "Exception", width: "26%" },
              { label: "Status", width: "8%" },
              { label: "Resolution", width: "34%" },
            ]}
            rows={pack.exceptions.map((e) => {
              const task = taskById.get(e.taskId);
              return [
                siteTime(e.createdAt, tz),
                `${task?.equipmentName ?? ""}${task?.recleanOfTaskId ? " (re-clean)" : ""}`,
                <View key="ex">
                  <Text style={{ color: e.severity === "red" ? red : amber, fontFamily: "Helvetica-Bold" }}>
                    {EXCEPTION_LABELS[e.type]} ({e.severity})
                  </Text>
                  <Text>{describeException(e.type, e.detail)}</Text>
                </View>,
                e.status,
                e.status === "resolved"
                  ? `${e.resolutionNote ?? ""} (${e.resolvedBy ?? "?"}, ${siteTime(e.resolvedAt, tz)})`
                  : "Open",
              ];
            })}
          />
        ) : (
          <Text style={s.muted}>No exceptions.</Text>
        )}

        <Text style={s.h2}>Pre-op inspections</Text>
        {pack.preops.length ? (
          <Table
            cols={[
              { label: "Shift", width: "12%" },
              { label: "Zone", width: "18%" },
              { label: "Result", width: "10%" },
              { label: "Inspector / time", width: "20%" },
              { label: "Failed items", width: "40%" },
            ]}
            rows={pack.preops.map((p) => [
              shiftDate.get(p.shiftId) ?? "",
              zoneName.get(p.zoneId) ?? "",
              <Text
                key="r"
                style={{ color: p.result === "pass" ? green : red, fontFamily: "Helvetica-Bold" }}
              >
                {p.result === "pass" ? "Pass" : "Fail"}
              </Text>,
              `${p.inspector}, ${siteTime(p.completedAt, tz)}`,
              p.items
                .filter((i) => !i.pass)
                .map((i) => `${i.label}: ${i.note ?? ""}${i.photo_path ? " (photo)" : ""}`)
                .join("; ") || "None",
            ])}
          />
        ) : (
          <Text style={s.muted}>No pre-op inspections.</Text>
        )}

        <Text style={s.h2}>Release decisions</Text>
        {pack.releases.length ? (
          <Table
            cols={[
              { label: "Shift", width: "12%" },
              { label: "Zone", width: "18%" },
              { label: "Decision", width: "16%" },
              { label: "By / time", width: "22%" },
              { label: "Reason", width: "32%" },
            ]}
            rows={pack.releases.map((r) => [
              shiftDate.get(r.shiftId) ?? "",
              zoneName.get(r.zoneId) ?? "",
              <Text
                key="d"
                style={{ color: r.decision === "released" ? green : red, fontFamily: "Helvetica-Bold" }}
              >
                {r.decision === "released" ? "Released" : "Held"}
                {r.override ? " (override)" : ""}
              </Text>,
              `${r.by}, ${siteTime(r.decidedAt, tz)}`,
              r.reason ?? "-",
            ])}
          />
        ) : (
          <Text style={s.muted}>No release decisions.</Text>
        )}
        <Footer pack={pack} />
      </Page>
    </Document>
  );
}

function Footer({ pack }: { pack: AuditPack }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {pack.site.name} · {pack.filter.from} to {pack.filter.to} ·{" "}
        {pack.chain.verified ? "Record integrity verified" : "Record integrity check FAILED"}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}
