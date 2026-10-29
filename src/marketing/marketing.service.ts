import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingEventDto } from './marketing.dto';

type RequestContext = { userAgent: string; country: string | null };
type SummaryRow = {
  visitors: number;
  newVisitors: number;
  sessions: number;
  pageViews: number;
  signups: number;
  onboarded: number;
};
type SessionRow = {
  sessions: number;
  bounced: number;
  averageSeconds: number | null;
};

const number = (value: unknown) => Number(value ?? 0);
const cairoDayKey = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const clean = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  async record(body: MarketingEventDto, context: RequestContext) {
    if (
      /bot|crawler|spider|headless|lighthouse|preview/i.test(context.userAgent)
    ) {
      return { accepted: false };
    }
    const path = body.path.startsWith('/') ? body.path.split('?')[0] : '/';
    await this.prisma.marketingEvent.create({
      data: {
        visitorId: body.visitorId,
        sessionId: body.sessionId,
        type: body.type,
        path,
        utmSource: clean(body.utmSource),
        utmMedium: clean(body.utmMedium),
        utmCampaign: clean(body.utmCampaign),
        utmContent: clean(body.utmContent),
        referrerHost: clean(body.referrerHost),
        deviceType: body.deviceType,
        country: /^[A-Z]{2}$/i.test(context.country ?? '')
          ? context.country!.toUpperCase()
          : null,
      },
    });
    return { accepted: true };
  }

  async overview(requestedDays: number) {
    const days = Math.min(365, Math.max(1, requestedDays || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const [
      summaryRows,
      sessionRows,
      trendRows,
      sourceRows,
      campaignRows,
      pageRows,
      deviceRows,
      hourRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
          WITH first_seen AS (
            SELECT visitor_id, min(created_at) AS first_at
            FROM marketing_events GROUP BY visitor_id
          ), scoped AS (
            SELECT e.*, f.first_at FROM marketing_events e
            JOIN first_seen f ON f.visitor_id = e.visitor_id
            WHERE e.created_at >= ${since}
          )
          SELECT
            count(DISTINCT visitor_id)::int AS visitors,
            count(DISTINCT visitor_id) FILTER (WHERE first_at >= ${since})::int AS "newVisitors",
            count(DISTINCT session_id)::int AS sessions,
            count(*) FILTER (WHERE type = 'PAGE_VIEW')::int AS "pageViews",
            count(DISTINCT visitor_id) FILTER (WHERE type = 'SIGNUP_COMPLETED')::int AS signups,
            count(DISTINCT visitor_id) FILTER (WHERE type = 'ONBOARDING_COMPLETED')::int AS onboarded
          FROM scoped
        `),
      this.prisma.$queryRaw<SessionRow[]>(Prisma.sql`
          WITH sessions AS (
            SELECT session_id,
              count(*) FILTER (WHERE type = 'PAGE_VIEW')::int AS views,
              bool_or(type IN ('SIGNUP_COMPLETED', 'ONBOARDING_COMPLETED')) AS converted,
              extract(epoch FROM (max(created_at) - min(created_at)))::float AS seconds
            FROM marketing_events WHERE created_at >= ${since}
            GROUP BY session_id
          )
          SELECT count(*)::int AS sessions,
            count(*) FILTER (WHERE views <= 1 AND NOT converted)::int AS bounced,
            round(avg(seconds)::numeric, 1)::float AS "averageSeconds"
          FROM sessions
        `),
      this.prisma.$queryRaw<
        Array<{
          day: Date;
          visitors: number;
          newVisitors: number;
          sessions: number;
          pageViews: number;
          signups: number;
          onboarded: number;
        }>
      >(Prisma.sql`
          WITH first_seen AS (
            SELECT visitor_id, min(created_at) AS first_at
            FROM marketing_events GROUP BY visitor_id
          )
          SELECT date_trunc('day', e.created_at AT TIME ZONE 'Africa/Cairo')::date AS day,
            count(DISTINCT e.visitor_id)::int AS visitors,
            count(DISTINCT e.visitor_id) FILTER (
              WHERE date_trunc('day', f.first_at AT TIME ZONE 'Africa/Cairo') = date_trunc('day', e.created_at AT TIME ZONE 'Africa/Cairo')
            )::int AS "newVisitors",
            count(DISTINCT e.session_id)::int AS sessions,
            count(*) FILTER (WHERE e.type = 'PAGE_VIEW')::int AS "pageViews",
            count(DISTINCT e.visitor_id) FILTER (WHERE e.type = 'SIGNUP_COMPLETED')::int AS signups,
            count(DISTINCT e.visitor_id) FILTER (WHERE e.type = 'ONBOARDING_COMPLETED')::int AS onboarded
          FROM marketing_events e JOIN first_seen f ON f.visitor_id = e.visitor_id
          WHERE e.created_at >= ${since}
          GROUP BY 1 ORDER BY 1
        `),
      this.prisma.$queryRaw<
        Array<{
          source: string;
          visitors: number;
          sessions: number;
          pageViews: number;
          signups: number;
        }>
      >(Prisma.sql`
          SELECT coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') AS source,
            count(DISTINCT visitor_id)::int AS visitors,
            count(DISTINCT session_id)::int AS sessions,
            count(*) FILTER (WHERE type = 'PAGE_VIEW')::int AS "pageViews",
            count(DISTINCT visitor_id) FILTER (WHERE type = 'SIGNUP_COMPLETED')::int AS signups
          FROM marketing_events WHERE created_at >= ${since}
          GROUP BY 1 ORDER BY visitors DESC, sessions DESC LIMIT 12
        `),
      this.prisma.$queryRaw<
        Array<{
          campaign: string;
          source: string;
          medium: string;
          visitors: number;
          sessions: number;
          signups: number;
          onboarded: number;
        }>
      >(Prisma.sql`
          SELECT coalesce(nullif(utm_campaign, ''), '(بدون حملة)') AS campaign,
            coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') AS source,
            coalesce(nullif(utm_medium, ''), 'none') AS medium,
            count(DISTINCT visitor_id)::int AS visitors,
            count(DISTINCT session_id)::int AS sessions,
            count(DISTINCT visitor_id) FILTER (WHERE type = 'SIGNUP_COMPLETED')::int AS signups,
            count(DISTINCT visitor_id) FILTER (WHERE type = 'ONBOARDING_COMPLETED')::int AS onboarded
          FROM marketing_events WHERE created_at >= ${since}
          GROUP BY 1,2,3 ORDER BY visitors DESC, sessions DESC LIMIT 30
        `),
      this.prisma.$queryRaw<
        Array<{ path: string; views: number; visitors: number }>
      >(Prisma.sql`
          SELECT path, count(*)::int AS views, count(DISTINCT visitor_id)::int AS visitors
          FROM marketing_events WHERE created_at >= ${since} AND type = 'PAGE_VIEW'
          GROUP BY path ORDER BY views DESC LIMIT 12
        `),
      this.prisma.$queryRaw<
        Array<{ device: string; visitors: number; sessions: number }>
      >(Prisma.sql`
          SELECT device_type AS device, count(DISTINCT visitor_id)::int AS visitors,
            count(DISTINCT session_id)::int AS sessions
          FROM marketing_events WHERE created_at >= ${since}
          GROUP BY device_type ORDER BY visitors DESC
        `),
      this.prisma.$queryRaw<
        Array<{ hour: number; sessions: number; visitors: number }>
      >(Prisma.sql`
          SELECT extract(hour FROM created_at AT TIME ZONE 'Africa/Cairo')::int AS hour,
            count(DISTINCT session_id)::int AS sessions,
            count(DISTINCT visitor_id)::int AS visitors
          FROM marketing_events WHERE created_at >= ${since}
          GROUP BY 1 ORDER BY 1
        `),
    ]);

    const summary = summaryRows[0] ?? {
      visitors: 0,
      newVisitors: 0,
      sessions: 0,
      pageViews: 0,
      signups: 0,
      onboarded: 0,
    };
    const sessions = sessionRows[0] ?? {
      sessions: 0,
      bounced: 0,
      averageSeconds: null,
    };
    const returningVisitors = Math.max(
      0,
      number(summary.visitors) - number(summary.newVisitors),
    );
    const rate = (part: number, total: number) =>
      total ? Math.round((part / total) * 1000) / 10 : 0;
    const dayMap = new Map(
      trendRows.map((row) => [
        cairoDayKey(row.day),
        {
          date: cairoDayKey(row.day),
          visitors: number(row.visitors),
          newVisitors: number(row.newVisitors),
          returningVisitors: Math.max(
            0,
            number(row.visitors) - number(row.newVisitors),
          ),
          sessions: number(row.sessions),
          pageViews: number(row.pageViews),
          signups: number(row.signups),
          onboarded: number(row.onboarded),
        },
      ]),
    );
    const trend = Array.from({ length: days }, (_, index) => {
      const date = cairoDayKey(
        new Date(Date.now() - (days - 1 - index) * 86_400_000),
      );
      return (
        dayMap.get(date) ?? {
          date,
          visitors: 0,
          newVisitors: 0,
          returningVisitors: 0,
          sessions: 0,
          pageViews: 0,
          signups: 0,
          onboarded: 0,
        }
      );
    });
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const row = hourRows.find((item) => number(item.hour) === hour);
      return {
        hour,
        sessions: number(row?.sessions),
        visitors: number(row?.visitors),
      };
    });

    return {
      range: {
        days,
        since: since.toISOString(),
        until: new Date().toISOString(),
        timeZone: 'Africa/Cairo',
      },
      summary: {
        visitors: number(summary.visitors),
        newVisitors: number(summary.newVisitors),
        returningVisitors,
        sessions: number(summary.sessions),
        pageViews: number(summary.pageViews),
        pagesPerSession: number(summary.sessions)
          ? Math.round(
              (number(summary.pageViews) / number(summary.sessions)) * 100,
            ) / 100
          : 0,
        bounceRate: rate(number(sessions.bounced), number(sessions.sessions)),
        averageSessionSeconds:
          sessions.averageSeconds == null
            ? null
            : number(sessions.averageSeconds),
        signups: number(summary.signups),
        onboarded: number(summary.onboarded),
        signupRate: rate(number(summary.signups), number(summary.visitors)),
        onboardingRate: rate(
          number(summary.onboarded),
          number(summary.signups),
        ),
      },
      realtime: {
        active5m: await this.activeVisitors(5),
        active30m: await this.activeVisitors(30),
      },
      trend,
      sources: sourceRows.map((row) => ({
        ...row,
        visitors: number(row.visitors),
        sessions: number(row.sessions),
        pageViews: number(row.pageViews),
        signups: number(row.signups),
      })),
      campaigns: campaignRows.map((row) => ({
        ...row,
        visitors: number(row.visitors),
        sessions: number(row.sessions),
        signups: number(row.signups),
        onboarded: number(row.onboarded),
        signupRate: rate(number(row.signups), number(row.visitors)),
      })),
      pages: pageRows.map((row) => ({
        ...row,
        views: number(row.views),
        visitors: number(row.visitors),
      })),
      devices: deviceRows.map((row) => ({
        ...row,
        visitors: number(row.visitors),
        sessions: number(row.sessions),
      })),
      hours,
      definitions: {
        visitor: 'Browser-scoped anonymous UUID; no IP or email is stored.',
        newVisitor:
          'A visitor whose first recorded event is inside the selected period.',
        returningVisitor:
          'A visitor seen before the selected period who returned during it.',
        bounce:
          'A session with one page view or fewer and no sign-up or onboarding conversion.',
      },
    };
  }

  private async activeVisitors(minutes: number) {
    const since = new Date(Date.now() - minutes * 60_000);
    const rows = await this.prisma.$queryRaw<
      Array<{ count: number }>
    >(Prisma.sql`
      SELECT count(DISTINCT visitor_id)::int AS count
      FROM marketing_events WHERE created_at >= ${since}
    `);
    return number(rows[0]?.count);
  }
}
