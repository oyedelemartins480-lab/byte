import Link from "next/link";
import { ThemeToggle } from "@/components/theme-provider";
import { ArrowRightIcon, HashIcon, LinkIcon, Logo, TimerIcon } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { Blob, Spark, Squiggle } from "@/components/decor";

const preview = [
  { name: "Tolu", initials: "TO", goal: "Ship the login screen", update: "10:00 · Auth form done, wiring Google sign-in", pct: 60 },
  { name: "Ada", initials: "AD", goal: "Read ch. 4–6, Designing Data-Intensive Apps", update: "Page 112 of 168", pct: 66 },
  { name: "Kemi", initials: "KE", goal: "Finish CSC 201 assignment", update: "10:00 · Questions 1–3 done", pct: 50 },
  { name: "You", initials: "ME", goal: "Write the Byte PRD", update: "Check-in due in 12 min", pct: 40, me: true },
];

const steps = [
  { time: "9:00", title: "Drop your goal", body: "Everyone says what they will finish before the timer starts. Code, reading, an assignment, anything." },
  { time: "10:00", title: "Byte asks: progress?", body: "A one-line update lands on the shared progress board. Everyone can see how everyone is doing." },
  { time: "11:00", title: "Keep going, quietly", body: "Chat stays quiet and nothing pings you. Need docs or a video? Tap research break." },
  { time: "13:00", title: "Drop what you did", body: "Byte puts goal and done side by side for each person, then writes a short wrap-up for the group." },
];

const chain = ["Project chat", "Family group", "Someone's status", "Memes"];

const h2 = "m-0 font-display text-[clamp(30px,3.4vw,46px)] font-extrabold leading-[1.1] tracking-[-0.02em]";
const lead = "m-0 text-lg leading-relaxed text-muted";

export default function Landing() {
  return (
    <div className="isolate min-h-dvh overflow-x-clip bg-bg text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-md">
        <nav aria-label="Main" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-6 px-6 py-3.5">
          <Link href="/" aria-label="Byte home" className="no-underline">
            <Logo />
          </Link>
          <div className="hidden flex-1 gap-6 text-[15px] md:flex">
            {[
              ["#how", "How it works"],
              ["#rooms", "Rooms"],
              ["#ai", "AI recap"],
              ["#score", "Focus score"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="text-muted no-underline hover:text-fg">
                {label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <Link href="/login" className="btn rounded-[10px] px-4 py-3 text-[15px] font-medium text-fg">
              Log in
            </Link>
            <Link href="/signup" className="btn rounded-[10px] bg-inv px-[18px] py-3 text-[15px] font-semibold text-inv-fg">
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="relative mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 pb-24 pt-20">
          <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10" />
          <Blob variant={1} outline tone="line" className="-left-24 top-6 -z-10 size-[300px]" />
          <Spark tone="fg" className="left-[44%] top-16 size-5" />
          <div className="relative flex min-w-0 flex-[1_1_440px] flex-col gap-6">
            <h1 className="m-0 font-display text-[clamp(40px,4.9vw,68px)] font-extrabold leading-[1.02] tracking-[-0.02em]">
              WhatsApp is where you talk.
              <br />
              Byte is where you{" "}
              <span className="relative inline-block">
                <span className="rounded-[14px] bg-hi px-2.5 text-hi-fg">lock in.</span>
                <Squiggle tone="fg" className="-bottom-5 left-3 h-4 w-[85%]" />
              </span>
            </h1>
            <p className="m-0 max-w-[52ch] text-[19px] leading-[1.55] text-muted">
              One web app for your team&apos;s work sessions. Chat, drop your goals, check in every hour and get an AI
              recap when time&apos;s up. It all lives on your laptop, so your phone stays face down.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn rounded-xl bg-inv px-6 py-[15px] font-semibold text-inv-fg">
                Start a lock-in
              </Link>
              <a href="#how" className="btn rounded-xl border border-line bg-surface px-6 py-[15px] font-medium text-fg">
                See how it works
              </a>
            </div>
            <p className="m-0 text-sm text-muted">
              Built for project teams, hackathon crews and study circles. Free for students, nothing to install.
            </p>
          </div>

          <div className="relative min-w-0 flex-[1_1_440px]">
            <Blob variant={0} float className="-right-16 -top-14 size-[420px] sm:-right-24" />
            <Blob variant={2} tone="fg" className="-bottom-10 -left-8 size-[120px] opacity-90" />
            <Spark tone="hi" className="-left-5 top-10 size-8" />
            <div className="relative flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-semibold">Morning lock-in</div>
                  <div className="text-[13px] text-muted">9:00–13:00 · 4 people</div>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-sunk px-3 py-2 font-mono text-sm tabular-nums">
                  <span className="size-2 rounded-full bg-live" />
                  02:14:08 left
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                <div className="h-full w-[44%] bg-fg" />
              </div>
              {preview.map((p) => (
                <div key={p.name} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <Avatar initials={p.initials} me={p.me} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="tabular-nums text-muted">{p.pct}%</span>
                    </div>
                    <div className="text-sm">{p.goal}</div>
                    <div className="h-1 overflow-hidden rounded-full bg-sunk">
                      <div className={`h-full ${p.me ? "bg-muted" : "bg-fg"}`} style={{ width: `${p.pct}%` }} />
                    </div>
                    <div className="text-[13px] text-muted">{p.update}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-xl bg-hi py-2.5 pl-3.5 pr-2.5 text-hi-fg">
                <span className="flex-1 text-sm font-medium">11:00 check-in. What did you get done this hour?</span>
                <span className="rounded-lg bg-inv px-3 py-2 text-[13px] font-semibold text-inv-fg">Post update</span>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="problem-h" className="relative overflow-hidden border-y border-line bg-surface">
          <Blob variant={3} tone="sunk" float className="-right-24 -top-20 size-[380px]" />
          <Spark tone="fg" className="bottom-12 right-[18%] size-5" />
          <div className="relative mx-auto flex max-w-[1160px] flex-col gap-8 px-6 py-20">
            <h2 id="problem-h" className={`${h2} max-w-[22ch]`}>
              You open WhatsApp for one project message. Twenty minutes later, you&apos;re watching statuses.
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 text-[15px]">
              {chain.map((c) => (
                <span key={c} className="flex items-center gap-2.5">
                  <span className="rounded-full border border-line px-4 py-2.5">{c}</span>
                  <ArrowRightIcon className="text-muted" />
                </span>
              ))}
              <span className="rounded-full bg-inv px-4 py-2.5 font-semibold text-inv-fg">The afternoon is gone</span>
            </div>
            <p className={`${lead} max-w-[60ch]`}>
              The conversation isn&apos;t the problem. The phone is, and everything that sits around the chat. Byte keeps
              your team&apos;s work talk on the laptop you&apos;re already working on.
            </p>
          </div>
        </section>

        <section id="rooms" aria-labelledby="rooms-h" className="mx-auto flex max-w-[1160px] flex-col gap-10 px-6 py-24">
          <div className="flex max-w-[60ch] flex-col gap-3">
            <h2 id="rooms-h" className={h2}>
              Two rooms, one habit
            </h2>
            <p className={lead}>
              Lock in on your own goals next to your people, or build one project together. Both run on a timer, with
              check-ins and a recap at the end.
            </p>
          </div>
          <div className="flex flex-wrap gap-5">
            <article className="relative flex min-w-0 flex-[1.5_1_420px] flex-col gap-5 overflow-hidden rounded-[28px] bg-inv p-10 text-inv-fg">
              <Blob variant={0} tone="hi" className="-bottom-28 -right-24 size-[320px] opacity-90" />
              <Blob variant={2} outline tone="inv-fg" className="-right-10 -top-16 size-[200px] opacity-30" />
              <div className="relative flex items-center gap-2.5 text-sm opacity-80">
                <TimerIcon /> Lock-In Room
              </div>
              <h3 className="relative m-0 max-w-[18ch] font-display text-4xl font-extrabold leading-[1.08] tracking-[-0.02em]">
                Everyone works on their own thing, together.
              </h3>
              <p className="relative m-0 max-w-[52ch] text-[17px] leading-relaxed opacity-80">
                Set a time, say 9 to 1. Everyone drops a goal. Byte asks for progress every hour and puts each update on a
                shared board. At the end, you drop what you finished and Byte checks it against your goal.
              </p>
              <div className="relative mt-2 flex flex-wrap gap-2">
                {["Drop a goal", "Hourly check-ins", "Goal vs. done", "Shareable invite link", "Open rooms"].map((t) => (
                  <span key={t} className="rounded-full border border-inv-fg/25 bg-inv/60 px-3.5 py-2 text-sm backdrop-blur-sm">
                    {t}
                  </span>
                ))}
              </div>
            </article>
            <article className="relative flex min-w-0 flex-[1_1_320px] flex-col gap-5 overflow-hidden rounded-[28px] border border-line bg-surface p-10">
              <Blob variant={1} tone="hi" className="-right-16 -top-16 size-[170px]" />
              <div className="relative flex items-center gap-2.5 text-sm text-muted">
                <HashIcon /> Build Room
              </div>
              <h3 className="m-0 font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.015em]">
                One project, one room.
              </h3>
              <p className="m-0 leading-relaxed text-muted">
                Real-time chat with replies, GIFs, stickers, files and code. Links and files collect themselves in the side
                panel. Turn on Lock-In mode when it&apos;s time to grind.
              </p>
              <p className="m-0 leading-relaxed text-muted">
                Every new session opens with a &ldquo;Last time…&rdquo; brief, so nobody asks &ldquo;where did we stop?&rdquo;
              </p>
            </article>
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="relative overflow-hidden border-y border-line bg-surface">
          <Blob variant={2} tone="hi" float className="-bottom-40 -left-32 size-[420px] opacity-70" />
          <div className="relative mx-auto flex max-w-[1160px] flex-wrap gap-14 px-6 py-24">
            <div className="relative flex flex-[1_1_320px] flex-col gap-3">
              <Squiggle tone="fg" className="-top-8 left-0 h-5 w-24" />
              <h2 id="how-h" className={h2}>
                A morning lock‑in, hour by hour
              </h2>
              <p className={lead}>
                It&apos;s body doubling with receipts. You don&apos;t need to be on the same project, or in the same room.
              </p>
            </div>
            <ol className="m-0 flex flex-[1.6_1_480px] list-none flex-col p-0">
              {steps.map((s) => (
                <li key={s.time} className="flex gap-6 border-t border-line py-6">
                  <span className="w-[72px] shrink-0 font-mono text-lg tabular-nums">{s.time}</span>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-lg font-semibold">{s.title}</span>
                    <span className="leading-normal text-muted">{s.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="ai" aria-labelledby="ai-h" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 py-24">
          <div className="flex flex-[1_1_380px] flex-col gap-4">
            <h2 id="ai-h" className={h2}>
              The AI takes notes, so nobody has to
            </h2>
            <p className={`${lead} max-w-[52ch]`}>
              While you work, Byte keeps a rolling summary. When time&apos;s up, you get a recap with decisions, who&apos;s
              doing what, blockers and every link that was shared. Ask{" "}
              <code className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-base">@ai</code> anything about the
              project&apos;s history.
            </p>
            <p className="m-0 text-[15px] text-muted">
              GIFs and stickers never reach the AI. The room owner can turn AI notes off.
            </p>
          </div>
          <div className="relative min-w-0 flex-[1_1_420px]">
          <Blob variant={3} tone="sunk" className="-right-14 -top-16 size-[300px]" />
          <Spark tone="fg" className="-bottom-4 -left-4 size-7" />
          <div className="relative flex flex-col gap-[18px] rounded-[24px] border border-line bg-surface p-6 shadow-[0_24px_50px_-30px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Session recap · Friday</span>
              <span className="rounded-full bg-hi px-2.5 py-1.5 text-[13px] font-semibold text-hi-fg">Team focused 87%</span>
            </div>
            <RecapBlock label="Decisions">Use Supabase for auth and realtime. Ship the GIF picker before voice notes.</RecapBlock>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Tasks</span>
              {[
                ["Tolu", "Room list and invite links"],
                ["Ada", "Hourly check-in prompts"],
                ["You", "GIF picker and composer"],
              ].map(([who, what]) => (
                <div key={who} className="flex gap-2.5 text-[15px]">
                  <span className="w-16 shrink-0 font-semibold">{who}</span>
                  <span>{what}</span>
                </div>
              ))}
            </div>
            <RecapBlock label="Blockers">Waiting on a GIF API key.</RecapBlock>
          </div>
          </div>
        </section>

        <section id="score" aria-labelledby="score-h" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 py-24">
            <div className="flex min-w-0 flex-[1_1_360px] flex-wrap items-center gap-8">
              <div className="relative">
              <Blob variant={0} tone="hi" float className="-inset-10 size-[280px]" />
              <div
                className="relative flex size-[200px] items-center justify-center rounded-full"
                style={{ background: "conic-gradient(var(--fg) 0 82%, var(--sunk) 82% 100%)" }}
              >
                <div className="flex size-[164px] flex-col items-center justify-center rounded-full bg-surface">
                  <span className="font-display text-[56px] font-extrabold leading-none tracking-[-0.02em]">82</span>
                  <span className="text-[13px] text-muted">Team focus score</span>
                </div>
              </div>
              </div>
              <dl className="m-0 flex min-w-[200px] flex-col gap-3 text-[15px]">
                {[
                  ["Focus time", "50%"],
                  ["Goals finished", "35%"],
                  ["Check-ins on time", "15%"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt>{k}</dt>
                    <dd className="m-0 text-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex flex-[1_1_380px] flex-col gap-4">
              <h2 id="score-h" className={h2}>
                A score for showing up and finishing
              </h2>
              <p className={lead}>
                The team number comes first, so it feels like teamwork, not surveillance. Need docs or a tutorial? Hit
                research break. Byte never logs which sites you visit.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Early Bird", "Night Owl", "Deep Diver", "Finisher"].map((b) => (
                  <span key={b} className="rounded-full border border-line px-3.5 py-2 text-sm">
                    {b}
                  </span>
                ))}
                <span className="rounded-full bg-hi px-3.5 py-2 text-sm font-semibold text-hi-fg">6-day streak</span>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="invite-h" className="relative mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-10 px-6 py-24">
          <Spark tone="fg" className="right-[38%] top-16 size-5" />
          <Blob variant={1} outline tone="line" className="-bottom-6 right-0 -z-10 size-[220px]" />
          <div className="flex flex-[1_1_380px] flex-col gap-3">
            <h2 id="invite-h" className={h2}>
              Send a link. They&apos;re in.
            </h2>
            <p className={`${lead} max-w-[50ch]`}>
              Every room has its own invite link. Drop it in the group chat once, then close WhatsApp.
            </p>
          </div>
          <div className="flex min-w-0 flex-[0_1_460px] items-center gap-2 rounded-[14px] border border-line bg-surface py-2 pl-[18px] pr-2">
            <LinkIcon className="shrink-0 text-muted" />
            <span className="flex-1 truncate font-mono text-[15px]">byte.chat/join/7Kq2mXa9Lb</span>
            <CopyButton text="https://byte.chat/join/7Kq2mXa9Lb" label="Copy link" className="min-h-11 rounded-[10px] bg-inv px-[18px] font-semibold text-inv-fg" />
          </div>
        </section>

        <section aria-labelledby="cta-h" className="px-6 pb-24">
          <div className="relative mx-auto flex max-w-[1160px] flex-wrap items-end justify-between gap-8 overflow-hidden rounded-[32px] bg-inv p-[clamp(40px,6vw,80px)] text-inv-fg">
            <Blob variant={2} tone="hi" float className="-right-20 -top-28 size-[380px]" />
            <Blob variant={0} outline tone="inv-fg" className="-bottom-24 left-[30%] size-[260px] opacity-25" />
            <Spark tone="hi" className="left-[46%] top-10 size-6" />
            <h2 id="cta-h" className="relative m-0 max-w-[14ch] font-display text-[clamp(36px,4.6vw,64px)] font-extrabold leading-[1.02] tracking-[-0.02em]">
              Your phone can stay face down.
            </h2>
            <Link href="/signup" className="btn relative rounded-xl bg-inv-fg px-[26px] py-4 text-[17px] font-semibold text-inv">
              Get started, it&apos;s free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-4 px-6 py-7 text-sm text-muted">
          <span>byte · lock in together · made in Lagos</span>
          <a href="#top" className="text-muted">
            Back to top
          </a>
        </div>
      </footer>
    </div>
  );
}

function Avatar({ initials, me }: { initials: string; me?: boolean }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
        me ? "bg-inv text-inv-fg" : "bg-sunk text-fg"
      }`}
    >
      {initials}
    </span>
  );
}

function RecapBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[15px]">{children}</span>
    </div>
  );
}
