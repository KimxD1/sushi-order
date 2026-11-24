// 초밥 일러스트 (SVG) — public/images 폴더에 사진을 넣으면 사진이 대신 표시됩니다
window.SushiArt = (function () {
  let uidN = 0;

  // 같은 결과가 나오는 난수
  function rng(seed) {
    return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  }
  const f = n => n.toFixed(1);

  const RICE_PATH = 'M42,90 C42,80 62,76 100,76 C138,76 158,80 158,90 L156,122 C155,133 138,138 100,138 C62,138 45,133 44,122 Z';

  function grains(seed, x0, x1, y0, y1, count) {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
      const rx = 3.2 + r() * 2.4, ry = 1.7 + r() * 0.9, a = r() * 180;
      s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${a | 0} ${f(x)} ${f(y)})"/>`;
    }
    return s;
  }

  function common(u) {
    return `
      <filter id="blur-${u}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      <linearGradient id="rice-${u}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#F3EFE6"/><stop offset="1" stop-color="#DDD6C8"/>
      </linearGradient>
      <linearGradient id="nori-${u}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0F1712"/><stop offset=".45" stop-color="#2A3A2D"/><stop offset=".55" stop-color="#253328"/><stop offset="1" stop-color="#0C120E"/>
      </linearGradient>
      <clipPath id="riceclip-${u}"><path d="${RICE_PATH}"/></clipPath>`;
  }

  function shadow(u) {
    return `<ellipse cx="100" cy="140" rx="68" ry="9" fill="rgba(60,30,10,.28)" filter="url(#blur-${u})"/>`;
  }

  function rice(u, seed) {
    return `
      <path d="${RICE_PATH}" fill="url(#rice-${u})"/>
      <g clip-path="url(#riceclip-${u})" fill="#FFFFFF" stroke="#D9D2C3" stroke-width=".6" opacity=".95">${grains(seed, 42, 158, 84, 140, 85)}</g>
      <path d="M44,122 C45,133 62,138 100,138 C138,138 155,133 156,122 C150,130 130,134 100,134 C70,134 50,130 44,122Z" fill="rgba(150,130,100,.18)"/>`;
  }

  function gloss(d, op = 0.45) {
    return `<path d="${d}" fill="#FFFFFF" opacity="${op}"/>`;
  }

  const ART = {
    egg(u) {
      return {
        defs: `
          <linearGradient id="eggF-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD84D"/><stop offset="1" stop-color="#EDA921"/></linearGradient>
          <linearGradient id="eggT-${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE98A"/><stop offset=".6" stop-color="#FFD44A"/><stop offset="1" stop-color="#F6BF33"/></linearGradient>`,
        body: `${rice(u, 11)}
          <path d="M28,68 C28,57 42,51 100,51 C158,51 172,57 172,68 L172,90 C172,98 158,102 100,102 C42,102 28,98 28,90Z" fill="url(#eggF-${u})"/>
          <g stroke="#E09B1C" stroke-width="1.4" fill="none" opacity=".55">
            <path d="M30,80 C60,86 140,86 170,80"/><path d="M30,90 C60,96 140,96 170,90"/>
          </g>
          <path d="M28,68 C28,57 42,51 100,51 C158,51 172,57 172,68 C172,76 158,81 100,81 C42,81 28,76 28,68Z" fill="url(#eggT-${u})"/>
          <g fill="#C9861A" opacity=".35"><ellipse cx="62" cy="66" rx="9" ry="3.5"/><ellipse cx="138" cy="62" rx="7" ry="3"/><ellipse cx="115" cy="72" rx="5" ry="2"/></g>
          ${gloss('M46,62 C60,56 90,55 104,57 C90,60 64,62 46,66Z', 0.55)}
          <path d="M86,51 C92,50 108,50 114,51 L116,136 C110,138 90,138 84,136 Z" fill="url(#nori-${u})"/>
          <path d="M86,51 C92,50 108,50 114,51 L114,56 C108,55 92,55 86,56Z" fill="#3B4D3F" opacity=".7"/>`
      };
    },

    inari(u) {
      const r = rng(5);
      let pores = '';
      for (let i = 0; i < 40; i++) pores += `<circle cx="${f(40 + r() * 120)}" cy="${f(80 + r() * 55)}" r="${f(0.8 + r() * 1.6)}"/>`;
      let seeds = '';
      for (let i = 0; i < 14; i++) {
        const x = 58 + r() * 84, y = 62 + r() * 12;
        seeds += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.4" ry="1.2" transform="rotate(${(r() * 180) | 0} ${f(x)} ${f(y)})" fill="${i % 3 ? '#F6EBD3' : '#2B2420'}"/>`;
      }
      return {
        defs: `
          <radialGradient id="tofu-${u}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#E9B261"/><stop offset=".6" stop-color="#C98832"/><stop offset="1" stop-color="#94591A"/></radialGradient>
          <clipPath id="open-${u}"><ellipse cx="100" cy="68" rx="52" ry="12"/></clipPath>`,
        body: `
          <path d="M32,98 C28,72 48,58 100,58 C152,58 172,72 168,98 C166,126 142,140 100,140 C58,140 34,126 32,98Z" fill="url(#tofu-${u})"/>
          <g fill="#8A4F14" opacity=".28">${pores}</g>
          <path d="M40,110 C60,126 140,126 160,110" stroke="#8A4F14" stroke-width="2" fill="none" opacity=".35"/>
          <ellipse cx="100" cy="68" rx="56" ry="15" fill="#B87526"/>
          <ellipse cx="100" cy="68" rx="52" ry="12" fill="url(#rice-${u})"/>
          <g clip-path="url(#open-${u})" fill="#FFF" stroke="#D9D2C3" stroke-width=".6">${grains(21, 46, 154, 56, 80, 40)}</g>
          ${seeds}
          <path d="M44,70 C46,80 60,84 70,84" stroke="#E7B66B" stroke-width="3" fill="none" opacity=".7" stroke-linecap="round"/>
          ${gloss('M52,92 C58,80 76,76 88,78 C74,84 62,90 56,100Z', 0.3)}`
      };
    },

    shrimp(u) {
      return {
        defs: `
          <linearGradient id="shr-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE8DA"/><stop offset="1" stop-color="#F7C7AE"/></linearGradient>
          <linearGradient id="tail-${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6A3D"/><stop offset="1" stop-color="#C92D1B"/></linearGradient>
          <clipPath id="shrc-${u}"><path d="M26,84 C30,64 66,56 106,58 C134,59 150,64 156,72 C156,88 146,96 104,98 C58,98 24,96 26,84Z"/></clipPath>`,
        body: `${rice(u, 33)}
          <path d="M150,70 L180,54 C188,62 188,84 181,92 L150,88 Z" fill="url(#tail-${u})"/>
          <path d="M156,72 L180,58 M156,80 L184,74 M156,86 L180,90" stroke="#9E2214" stroke-width="1.4" opacity=".6"/>
          <path d="M26,84 C30,64 66,56 106,58 C134,59 150,64 156,72 C156,88 146,96 104,98 C58,98 24,96 26,84Z" fill="url(#shr-${u})"/>
          <g clip-path="url(#shrc-${u})" fill="none" stroke="#FF6A3D" stroke-linecap="round">
            <path d="M40,56 C46,72 46,88 40,104" stroke-width="7"/>
            <path d="M64,52 C70,70 70,90 64,106" stroke-width="8"/>
            <path d="M90,52 C96,70 96,90 90,106" stroke-width="8"/>
            <path d="M116,52 C122,70 122,90 116,106" stroke-width="8"/>
            <path d="M140,54 C146,70 146,88 140,104" stroke-width="7"/>
          </g>
          <g clip-path="url(#shrc-${u})"><rect x="0" y="50" width="200" height="60" fill="#7A3A10" opacity=".22"/></g>
          <path d="M40,78 C70,70 130,70 150,76" stroke="#B5501F" stroke-width="2" fill="none" opacity=".45"/>
          ${gloss('M46,70 C66,62 100,61 120,63 C100,66 70,69 50,75Z', 0.6)}`
      };
    },

    salmon(u) {
      return {
        defs: `
          <linearGradient id="sal-${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFA37A"/><stop offset=".55" stop-color="#FF7F4F"/><stop offset="1" stop-color="#E9592C"/></linearGradient>
          <clipPath id="salc-${u}"><path d="M22,84 C28,62 62,54 104,56 C150,58 178,66 178,86 C178,96 150,100 100,99 C52,99 20,96 22,84Z"/></clipPath>`,
        body: `${rice(u, 44)}
          <path d="M22,84 C28,62 62,54 104,56 C150,58 178,66 178,86 C178,96 150,100 100,99 C52,99 20,96 22,84Z" fill="url(#sal-${u})"/>
          <g clip-path="url(#salc-${u})" fill="none" stroke="#FFE6D6" stroke-linecap="round" opacity=".85">
            <path d="M20,70 C40,80 50,96 48,110" stroke-width="4"/>
            <path d="M46,56 C68,70 80,90 78,108" stroke-width="5"/>
            <path d="M78,50 C100,66 112,88 110,108" stroke-width="5"/>
            <path d="M110,50 C132,66 144,86 142,106" stroke-width="5"/>
            <path d="M142,52 C162,66 172,84 172,102" stroke-width="4"/>
          </g>
          <path d="M22,84 C24,92 50,98 100,99 C150,100 176,96 178,86 C176,92 150,96 100,95 C54,95 28,92 22,84Z" fill="#C9461E" opacity=".5"/>
          ${gloss('M40,72 C60,62 100,60 126,62 C100,66 66,70 46,78Z', 0.5)}`
      };
    },

    beef(u) {
      const r = rng(9);
      let seeds = '';
      for (let i = 0; i < 12; i++) {
        const x = 50 + r() * 100, y = 62 + r() * 22;
        seeds += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.4" ry="1.2" transform="rotate(${(r() * 180) | 0} ${f(x)} ${f(y)})" fill="#FFF6E2"/>`;
      }
      let onion = '';
      [[72, 64], [96, 60], [120, 66], [108, 74], [84, 74], [134, 72]].forEach(([x, y]) => {
        onion += `<circle cx="${x}" cy="${y}" r="4.2" fill="none" stroke="#4CAF50" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="1.4" fill="#A5D66F"/>`;
      });
      return {
        defs: `
          <linearGradient id="beef-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C96A5A"/><stop offset=".6" stop-color="#A84A3D"/><stop offset="1" stop-color="#6E2A22"/></linearGradient>
          <clipPath id="beefc-${u}"><path d="M20,86 C26,62 60,52 104,54 C150,56 180,66 180,88 C180,98 150,102 100,101 C50,101 18,98 20,86Z"/></clipPath>`,
        body: `${rice(u, 55)}
          <path d="M20,86 C26,62 60,52 104,54 C150,56 180,66 180,88 C180,98 150,102 100,101 C50,101 18,98 20,86Z" fill="url(#beef-${u})"/>
          <g clip-path="url(#beefc-${u})">
            <g stroke="#F3C9BC" stroke-width="1.3" fill="none" opacity=".5">
              <path d="M30,80 C50,74 60,86 80,80 C96,75 110,88 130,82"/><path d="M90,66 C104,62 120,72 140,68 C152,66 160,74 172,72"/>
            </g>
            <g stroke="#3A1510" stroke-width="7" opacity=".38" stroke-linecap="round">
              <path d="M44,54 L74,104"/><path d="M80,52 L110,104"/><path d="M116,52 L146,104"/><path d="M152,54 L178,98"/>
            </g>
            <rect x="0" y="50" width="200" height="60" fill="none" stroke="#4A1A12" stroke-width="10" opacity=".25"/>
          </g>
          ${gloss('M40,72 C60,62 100,58 124,60 C100,64 66,70 46,78Z', 0.4)}
          ${onion}${seeds}`
      };
    },

    roe(u) {
      const r = rng(3);
      const beads = [];
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const x = 100 + Math.cos(a) * d * 54;
        const yBase = 70 + Math.sin(a) * d * 14;
        const lift = (1 - d) * 16;
        beads.push([x, yBase - lift]);
      }
      beads.sort((a, b) => a[1] - b[1]);
      const beadSvg = beads.map(([x, y]) =>
        `<circle cx="${f(x)}" cy="${f(y)}" r="5.2" fill="url(#bead-${u})"/><circle cx="${f(x - 1.8)}" cy="${f(y - 1.8)}" r="1.4" fill="#FFF" opacity=".85"/>`
      ).join('');
      return {
        defs: `<radialGradient id="bead-${u}" cx=".4" cy=".4" r=".6"><stop offset="0" stop-color="#FFC27A"/><stop offset=".6" stop-color="#FF7A2E"/><stop offset="1" stop-color="#D8481A"/></radialGradient>`,
        body: `
          <path d="M150,62 C168,46 182,58 176,76 C170,86 158,84 152,76Z" fill="#6DBE45"/>
          <path d="M152,74 C160,64 170,58 176,60" stroke="#3E8E2A" stroke-width="1.6" fill="none"/>
          <ellipse cx="100" cy="72" rx="62" ry="16" fill="#0E1611"/>
          <ellipse cx="100" cy="72" rx="58" ry="13" fill="#E9E3D6"/>
          ${beadSvg}
          <path d="M38,72 L38,124 C38,134 68,140 100,140 C132,140 162,134 162,124 L162,72 C162,82 132,88 100,88 C68,88 38,82 38,72Z" fill="url(#nori-${u})"/>
          <path d="M38,72 C38,82 68,88 100,88 C132,88 162,82 162,72 C162,78 132,85 100,85 C68,85 38,78 38,72Z" fill="#3E5442" opacity=".8"/>
          <g stroke="#3B4D3F" stroke-width="1" opacity=".35"><path d="M60,92 L58,134"/><path d="M120,92 L122,136"/><path d="M90,95 L91,138"/></g>
          ${gloss('M50,96 C54,94 60,94 62,96 L60,128 C56,128 52,126 50,124Z', 0.12)}`
      };
    },

    eggplant(u) {
      return {
        defs: `
          <radialGradient id="egp-${u}" cx=".45" cy=".3" r=".8"><stop offset="0" stop-color="#C79A5C"/><stop offset=".6" stop-color="#94643A"/><stop offset="1" stop-color="#5E3B22"/></radialGradient>
          <linearGradient id="skin-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A1233"/><stop offset=".5" stop-color="#5A2A63"/><stop offset="1" stop-color="#2A1233"/></linearGradient>`,
        body: `${rice(u, 66)}
          <path d="M24,86 C28,64 60,56 102,58 C146,60 176,68 176,88 C176,98 148,102 100,101 C52,101 22,98 24,86Z" fill="url(#egp-${u})"/>
          <path d="M24,86 C28,64 60,56 102,58 C146,60 176,68 176,88 C172,72 146,64 102,63 C60,62 32,70 24,86Z" fill="url(#skin-${u})"/>
          <g stroke="#4A2C18" stroke-width="1.4" fill="none" opacity=".4">
            <path d="M44,80 C70,76 90,84 120,80"/><path d="M80,90 C104,86 130,92 160,86"/>
          </g>
          ${gloss('M44,74 C62,68 98,66 126,68 C100,72 70,74 50,80Z', 0.42)}
          <path d="M84,62 C84,54 96,48 104,50 C114,48 120,56 118,64 C112,68 92,68 84,62Z" fill="#F4DDA2"/>
          <g stroke="#E6C27A" stroke-width="1" opacity=".7"><path d="M92,56 L98,64"/><path d="M104,54 L106,64"/><path d="M112,56 L110,64"/></g>
          <circle cx="94" cy="50" r="3.4" fill="none" stroke="#4CAF50" stroke-width="2"/>
          <circle cx="108" cy="47" r="3.4" fill="none" stroke="#4CAF50" stroke-width="2"/>`
      };
    }
  };

  function svg(id) {
    const fn = ART[id];
    const u = 's' + (++uidN);
    if (!fn) {
      return `<svg viewBox="0 36 200 118" class="sushi-art" aria-hidden="true"><defs>${common(u)}</defs>${shadow(u)}${rice(u, 77)}</svg>`;
    }
    const a = fn(u);
    return `<svg viewBox="0 36 200 118" class="sushi-art" aria-hidden="true"><defs>${common(u)}${a.defs}</defs>${shadow(u)}${a.body}</svg>`;
  }

  return { svg };
})();
