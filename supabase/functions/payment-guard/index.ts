import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Real client IP (Supabase Edge runs on Deno Deploy — x-forwarded-for is set)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const body = await req.json().catch(() => ({}))
  const { action, ua } = body

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  /* ── CHECK: is this IP blocked? ────────────────────── */
  if (action === 'check') {
    const { data } = await sb
      .from('payment_blocks')
      .select('fail_count, blocked')
      .eq('ip', ip)
      .maybeSingle()

    return json({
      blocked: data?.blocked === true || (data?.fail_count ?? 0) >= 2,
      fails:   data?.fail_count ?? 0,
    })
  }

  /* ── FAIL: record a payment failure for this IP ─────── */
  if (action === 'fail') {
    const { data: existing } = await sb
      .from('payment_blocks')
      .select('id, fail_count')
      .eq('ip', ip)
      .maybeSingle()

    if (existing) {
      const newCount = existing.fail_count + 1
      const blocked  = newCount >= 2
      await sb
        .from('payment_blocks')
        .update({
          fail_count:   newCount,
          blocked,
          last_attempt: new Date().toISOString(),
          ua:           (ua ?? '').substring(0, 250),
        })
        .eq('id', existing.id)
      return json({ fails: newCount, blocked })
    } else {
      await sb.from('payment_blocks').insert({
        ip,
        fail_count:   1,
        blocked:      false,
        ua:           (ua ?? '').substring(0, 250),
        last_attempt: new Date().toISOString(),
      })
      return json({ fails: 1, blocked: false })
    }
  }

  return json({ error: 'unknown action' }, 400)
})
