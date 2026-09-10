import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function listContent(statuses?: string[]) {
  const db = getDb();
  const rows = statuses
    ? db.select().from(schema.contentItems).where(inArray(schema.contentItems.status, statuses)).all()
    : db.select().from(schema.contentItems).all();
  return rows
    .map((r) => ({ ...r, outline: parse<string[]>(r.outline, []) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function countContent(statuses: string[]) {
  const [{ n }] = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.contentItems)
    .where(inArray(schema.contentItems.status, statuses))
    .all();
  return n;
}

export function listInsights() {
  return getDb().select().from(schema.insights).orderBy(desc(schema.insights.confidence)).all();
}

export function listPersonas() {
  return getDb()
    .select()
    .from(schema.personas)
    .all()
    .map((p) => ({
      ...p,
      goals: parse<string[]>(p.goals, []),
      painPoints: parse<string[]>(p.painPoints, []),
      objections: parse<string[]>(p.objections, []),
      channels: parse<string[]>(p.channels, []),
    }));
}

export function listResearch() {
  return getDb()
    .select()
    .from(schema.platformResearch)
    .all()
    .map((r) => ({
      ...r,
      trendingTopics: parse<string[]>(r.trendingTopics, []),
      bestPostingTimes: parse<string[]>(r.bestPostingTimes, []),
      contentFormats: parse<string[]>(r.contentFormats, []),
    }))
    .sort((a, b) => b.audienceFit - a.audienceFit);
}

export function listPosts() {
  return getDb().select().from(schema.scheduledPosts).orderBy(desc(schema.scheduledPosts.scheduledFor)).all();
}

export function listAds() {
  return getDb().select().from(schema.adCampaigns).all();
}

export function listLeads() {
  return getDb()
    .select()
    .from(schema.leads)
    .orderBy(desc(schema.leads.lastMessageAt))
    .all()
    .map((l) => ({ ...l, tags: parse<string[]>(l.tags, []) }));
}

export function listConversations() {
  const db = getDb();
  const convs = db.select().from(schema.conversations).all();
  const msgs = db.select().from(schema.messages).orderBy(schema.messages.at).all();
  return convs
    .map((c) => ({ ...c, messages: msgs.filter((m) => m.conversationId === c.id) }))
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1]?.at ?? "";
      const lb = b.messages[b.messages.length - 1]?.at ?? "";
      return lb.localeCompare(la);
    });
}

export function listRules() {
  return getDb().select().from(schema.autoReplyRules).all();
}

export function listEmailSequences() {
  return getDb().select().from(schema.emailSequences).all();
}

export function listEmailCampaigns() {
  return getDb().select().from(schema.emailCampaigns).all();
}

export function listIntegrations() {
  return getDb()
    .select({
      key: schema.integrations.key,
      name: schema.integrations.name,
      description: schema.integrations.description,
      connected: schema.integrations.connected,
      account: schema.integrations.account,
    })
    .from(schema.integrations)
    .all();
}

export function listActivity(limit = 8) {
  return getDb().select().from(schema.activity).orderBy(desc(schema.activity.at)).limit(limit).all();
}

export function getAutomation(): Record<string, boolean> {
  const rows = getDb().select().from(schema.settings).all();
  const out: Record<string, boolean> = {};
  for (const r of rows) if (r.key.startsWith("automation.")) out[r.key.slice("automation.".length)] = r.value === "1";
  return out;
}

export function getBrand() {
  return {
    name: getSetting("brand.name") ?? "",
    products: getSetting("brand.products") ?? "",
    voice: getSetting("brand.voice") ?? "",
  };
}

export function getAdGuardrails() {
  return {
    dailyCap: Number(getSetting("ads.dailyCap") ?? 500000),
    monthlyCap: Number(getSetting("ads.monthlyCap") ?? 12000000),
    autoPauseCplAbove: Number(getSetting("ads.autoPauseCplAbove") ?? 60000),
  };
}

export function pendingCounts() {
  const db = getDb();
  const ideas = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.contentItems)
    .where(eq(schema.contentItems.status, "proposed"))
    .get()!.n;
  const mine = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.contentItems)
    .where(inArray(schema.contentItems.status, ["in_progress", "review"]))
    .get()!.n;
  const ads = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.status, "pending_approval"))
    .get()!.n;
  const convs = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.needsHuman, true)))
    .get()!.n;
  return { ideas, mine, ads, convs };
}
