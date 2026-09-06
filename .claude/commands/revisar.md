---
description: Revisa los cambios pendientes con ojos frescos y escepticismo
argument-hint: [rama o vacio para working tree]
allowed-tools: Bash(git:*), Bash(grep:*), Bash(sed:*), Bash(ls:*), Read
---
Revisa estos cambios como si NO los hubieras escrito tú. Eres escéptico:
tu trabajo es encontrar lo que rompe, no felicitar.

Rama actual:
!`git branch --show-current`

Archivos tocados:
!`git status --short`

Diff:
!`git diff HEAD $ARGUMENTS 2>/dev/null | head -400`

## Qué buscar, en orden de importancia

1. **Rompe producción** — el sitio es estático y se despliega directo desde
   `main` a platatechs.com. No hay CI que atrape nada.
2. **Archivos generados editados a mano** — cualquier cambio en
   `shop/assets/products.js` o `products-static.js` es un bug: el próximo
   sync lo borra. Debía ir en `products-overrides.js`.
3. **Pagos** — cambios en `supabase/functions/azul-*`. El AuthHash sigue la
   spec oficial de AZUL; alterar orden o formato de campos rompe el cobro
   silenciosamente. Reintroducir PayPal es un error.
4. **Precios y márgenes** — ¿la lógica cuadra con las reglas de CLAUDE.md?
5. **Secretos** — llaves, tokens o credenciales en archivos versionados.
6. **Casos borde** — nulls, arrays vacíos, catálogo sin resultados.
7. **HTML/SEO** — em-dash en titles o meta descriptions, `alt` faltantes,
   enlaces rotos entre landings.

## Formato

Para cada hallazgo:
- `ruta:línea` — qué está mal — qué pasa si se despliega así.

Ordenado por severidad. Si no hay hallazgos reales, dilo en una línea; no
inventes problemas menores para parecer útil.

No arregles nada. Solo reporta.
