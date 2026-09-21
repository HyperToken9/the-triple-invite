/* =========================================================================
   WIREFRAME  --  a tiny parametric 3D line renderer
   -------------------------------------------------------------------------
   No library, no network. Each shape is a list of 3D polylines; every frame
   they are rotated, projected, and stroked to a canvas. Depth is carried by
   line alpha alone -- nothing is filled, nothing is shaded.

     Wire.mount(canvasEl, { shape, color, speed, bg })

   shape : 'ball' | 'heart' | 'rings' | 'flutes'
   Each shape brings its own behaviour, so the markup stays a bare canvas:
     ball   flashes    -- a scatter of facet studs bursts ~1.5x a second
     heart  pulses     -- a two-part beat, lub then dub
     rings  occlude    -- see the note on painter's ordering below
   ========================================================================= */

(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var YAW0 = 0.6;          // the resting camera yaw; shapes are posed against it
  var FLASH_HZ = 1.5;      // bursts per second on the ball and the spray
  var MAX_PX   = 1100;     // cap on a canvas's longest backing-store side
  var BANDS    = 7;        // depth buckets; see the note on batching in draw()
  var FPS      = 30;       // these drift slowly -- 60 buys nothing and costs double

  /* ---------------------------------------------------------- meshes ---- */

  /* Disco ball: latitude bands + longitude meridians, plus facet studs. */
  function ball() {
    var lines = [], dots = [], i, j, lat, lon, r, y, p;
    var LAT = 11, LON = 18, STEP = 32;

    for (i = 1; i < LAT; i++) {                       // latitude rings
      lat = Math.PI * i / LAT;
      r = Math.sin(lat); y = Math.cos(lat);
      p = [];
      for (j = 0; j <= STEP; j++) {
        lon = TAU * j / STEP;
        p.push([r * Math.cos(lon), y, r * Math.sin(lon)]);
      }
      lines.push(p);
    }
    for (j = 0; j < LON; j++) {                       // meridians
      lon = TAU * j / LON;
      p = [];
      for (i = 0; i <= STEP; i++) {
        lat = Math.PI * i / STEP;
        p.push([Math.sin(lat) * Math.cos(lon), Math.cos(lat),
                Math.sin(lat) * Math.sin(lon)]);
      }
      lines.push(p);
    }
    /* Facet studs, offset half a cell from the grid so they read as the
       mirror tiles rather than as the grid repeated. Each carries a fixed
       phase so the twinkle is scattered rather than synchronised. */
    for (i = 1; i < LAT; i++) {
      lat = Math.PI * (i + 0.5) / LAT;
      r = Math.sin(lat); y = Math.cos(lat);
      for (j = 0; j < LON; j++) {
        lon = TAU * (j + 0.5) / LON;
        dots.push([r * Math.cos(lon), y, r * Math.sin(lon),
                   (i * 7.13 + j * 3.77) % TAU]);
      }
    }
    return { lines: lines, dots: dots, twinkle: true };
  }

  /* Heart: the classic heart curve as a silhouette, inflated in z.
     A point is (centre + w * (outline - centre), +/- T * sqrt(1 - w^2)),
     so constant-w gives the concentric loops and constant-u the ribs. */
  function heartPoint(u, w, sign) {
    var s = Math.sin(u);
    var x = 16 * s * s * s;
    var y = 13 * Math.cos(u) - 5 * Math.cos(2 * u)
          - 2 * Math.cos(3 * u) - Math.cos(4 * u);
    x /= 17; y = (y + 1.2) / 17;                      // normalise, centre
    return [x * w, y * w, sign * 0.44 * Math.sqrt(Math.max(0, 1 - w * w))];
  }

  function heart() {
    var lines = [], i, j, u, w, p, sign, k;
    /* few lines, well spaced: crossing two dense shells turns the middle of
       the heart into mush and the silhouette stops reading */
    var RIB = 15, LOOP = 4, STEP = 80;

    for (k = 0; k < 2; k++) {                         // front and back shells
      sign = k ? -1 : 1;
      for (i = 1; i <= LOOP; i++) {                   // concentric loops
        w = i / (LOOP + 0.4);
        p = [];
        for (j = 0; j <= STEP; j++) p.push(heartPoint(TAU * j / STEP, w, sign));
        lines.push(p);
      }
      for (j = 0; j < RIB; j++) {                     // ribs, pole to rim
        u = TAU * j / RIB;
        p = [];
        for (i = 0; i <= 14; i++) p.push(heartPoint(u, i / 14, sign));
        lines.push(p);
      }
    }
    p = [];                                           // the silhouette itself
    for (j = 0; j <= 160; j++) p.push(heartPoint(TAU * j / 160, 1, 0));
    lines.push(p);
    return { lines: lines, dots: [], pulse: true };
  }

  /* ---- rings -----------------------------------------------------------
     A wedding band is a flat ribbon, not a round tube: the reference shows
     the outer face and the inner face of each band as separate edges. So the
     cross-section here is a RECTANGLE -- `halfW` along the finger, `thick`
     radially -- giving four rails instead of a bundle of pipes.

     `tiltY` turns the band's plane. Two bands whose planes cross, with their
     centres closer together than one radius, are genuinely linked. */
  function band(R, halfW, thick, tiltY, offX, rails, sections, gem, round) {
    var lines = [], dots = [], i, j, a, p, corners, c, s;
    c = Math.cos(tiltY); s = Math.sin(tiltY);

    /* The two rings are not the same object. The man's band is BOXY -- a
       rectangular section, wide and chunky. The woman's is a thin round
       wire, so its section is a small circle. Same code either way; only
       the cross-section changes. */
    if (round) {
      corners = [];
      for (i = 0; i < 6; i++) {
        var ct = TAU * i / 6;
        corners.push([thick * Math.cos(ct), thick * Math.sin(ct)]);
      }
    } else {
      corners = [[-thick, -halfW], [thick, -halfW], [thick, halfW], [-thick, halfW]];
    }

    function at(a, dv, du) {                          // dv radial, du axial
      var x = (R + dv) * Math.cos(a);
      var y = (R + dv) * Math.sin(a);
      var z = du;
      return [x * c + z * s + offX, y, -x * s + z * c];
    }
    for (i = 0; i < corners.length; i++) {            // the four long edges
      p = [];
      for (j = 0; j <= rails; j++) {
        a = TAU * j / rails;
        p.push(at(a, corners[i][0], corners[i][1]));
      }
      lines.push(p);
    }
    for (j = 0; j < sections; j++) {                  // cross-sections
      a = TAU * j / sections;
      p = [];
      for (i = 0; i <= corners.length; i++) {
        var k = i % corners.length;
        p.push(at(a, corners[k][0], corners[k][1]));
      }
      lines.push(p);
    }

    /* ---- the solitaire -------------------------------------------------
       A round brilliant is three rings of geometry: a flat TABLE on top, the
       widest GIRDLE below it, and a pavilion running to a single point, the
       CULET, with facets between them. That silhouette is what people
       recognise -- drawing all 57 real facets would only be noise at this
       size. Built in the band's own frame at the top of the ring, where
       `pr` runs radially outward from the finger and (q, ax) span the
       plane facing away from it. */
    if (gem) {
      /* Not at the top of the band -- that is exactly where his ring crosses
         hers, so the stone sat right on the join. Not a quarter turn round
         either, which swung it down onto the outer edge. Halfway between:
         high on the outer shoulder, clear of his band but still reading as
         the top of the ring. */
      var a0 = Math.PI * 3 / 8, N = 8;
      var rg = 0.105, rt = 0.058;
      var pGird = thick + 0.075, pTable = thick + 0.155, pCulet = thick + 0.004;
      var ca = Math.cos(a0), sa = Math.sin(a0);

      var gemPt = function (pr, q, ax) {
        var gx = (R + pr) * ca - q * sa;
        var gy = (R + pr) * sa + q * ca;
        return [gx * c + ax * s + offX, gy, -gx * s + ax * c];
      };

      var loc = [], gi;                               // local (q, ax) per vertex
      for (gi = 0; gi <= N; gi++) {
        var th = TAU * gi / N;
        loc.push([Math.cos(th), Math.sin(th)]);
      }
      var girdle = [], table = [];
      for (gi = 0; gi <= N; gi++) {
        girdle.push(gemPt(pGird, rg * loc[gi][0], rg * loc[gi][1]));
        table.push(gemPt(pTable, rt * loc[gi][0], rt * loc[gi][1]));
      }
      lines.push(girdle);
      lines.push(table);

      var culet = gemPt(pCulet, 0, 0);
      for (gi = 0; gi < N; gi++) {
        lines.push([table[gi], girdle[gi]]);          // crown facets
        lines.push([girdle[gi], culet]);              // pavilion facets
      }
      for (gi = 0; gi < N; gi += 2) {                 // four claws gripping it
        lines.push([gemPt(thick, rg * loc[gi][0] * 0.8, rg * loc[gi][1] * 0.8),
                    girdle[gi]]);
      }

      /* One catch of light, on the table. Sparkling every girdle corner as
         well turned the stone into a small disco ball of its own, which is
         the job of the other panel. */
      dots.push(gemPt(pTable, 0, 0).concat([0]));
    }
    return { lines: lines, dots: dots };
  }

  function rings() {
    /* Centres 0.56 apart against a radius of 0.52: each band's centre falls
       inside the other's circle, which is what makes them interlock rather
       than merely overlap. Planes are ~63 degrees apart -- enough to read as
       two bands, not so much that one turns edge-on to the camera.

       One band carries the stone, as in the reference: an engagement ring
       and a plain band, not two of the same thing. */
    /* Kept modest on segment count: occlusion means every segment is
       stroked twice and depth-sorted each frame, so that count is the cost. */
    /* Centres 0.46 apart. The link survives only while that stays under the
       SMALLER radius (0.51) -- past it the two simply overlap on screen
       instead of passing through each other, which is the whole point. */
    var his = band(0.56, 0.105, 0.042, -YAW0 - 0.52, -0.22, 40, 11, false, false);
    var hers = band(0.51, 0, 0.034, -YAW0 + 0.52, 0.24, 36, 10, true, true);
    return {
      lines: his.lines.concat(hers.lines),
      dots: hers.dots,
      occlude: true,
      twinkle: true,
      flashAll: true,
      tiltX: 0.30      // looked into obliquely, as in the reference
    };
  }

  /* ---- flutes ----------------------------------------------------------
     Two champagne glasses, clinked. Each is a surface of revolution, so it
     is only a profile -- [height, radius, draw a ring here] -- spun about
     its own axis, then tilted in toward the other until the rims meet. */
  function lathe(profile, longs, tiltZ, offX, offY) {
    var lines = [], i, j, a, p, r, y;
    var c = Math.cos(tiltZ), s = Math.sin(tiltZ);

    function place(x, y, z) {
      return [x * c - y * s + offX, x * s + y * c + offY, z];
    }
    for (j = 0; j < longs; j++) {                     // meridians
      a = TAU * j / longs;
      p = [];
      for (i = 0; i < profile.length; i++) {
        r = profile[i][1]; y = profile[i][0] - 0.67;
        p.push(place(r * Math.cos(a), y, r * Math.sin(a)));
      }
      lines.push(p);
    }
    for (i = 0; i < profile.length; i++) {            // rings, only where marked
      if (!profile[i][2]) continue;
      r = profile[i][1]; y = profile[i][0] - 0.67;
      p = [];
      for (j = 0; j <= 26; j++) {
        a = TAU * j / 26;
        p.push(place(r * Math.cos(a), y, r * Math.sin(a)));
      }
      lines.push(p);
    }
    return lines;
  }

  function flutes() {
    /* foot, a long stem, then the bowl flaring and tucking back in at the
       rim -- that tuck is what makes it a flute rather than a cone */
    var P = [
      [0.00, 0.30, 1],   // foot
      [0.03, 0.29, 0],
      [0.05, 0.09, 0],
      [0.07, 0.028, 1],  // stem
      [0.46, 0.026, 0],
      [0.52, 0.050, 0],
      [0.58, 0.095, 1],  // bowl begins
      [0.70, 0.150, 0],
      [0.84, 0.190, 1],
      [1.00, 0.213, 0],
      [1.16, 0.222, 1],
      [1.34, 0.212, 1]   // rim
    ];
    /* The sign here is the difference between a clink and a shrug: a
       positive tilt on the LEFT glass swings its rim further left, away
       from its partner. Each glass leans toward the other, feet splayed
       out, rims just overlapping. */
    var TILT = 0.34;
    var lines = lathe(P, 9, -TILT, -0.40, 0)
      .concat(lathe(P, 9, TILT, 0.40, 0));

    /* the spray off the clink: a scatter of points above the rims that
       catch the light on the same flash as everything else */
    var dots = [], i, r, t;
    for (i = 0; i < 14; i++) {
      t = i * 2.399;                                  // golden angle, so no rows
      r = 0.08 + 0.22 * (i / 14);
      dots.push([r * Math.cos(t) * 1.25,
                 0.60 + r * Math.abs(Math.sin(t)) * 1.2,
                 r * Math.sin(t) * 0.5,
                 (i * 1.77) % TAU]);
    }
    return { lines: lines, dots: dots, twinkle: true };
  }

  var SHAPES = { ball: ball, heart: heart, rings: rings, flutes: flutes };

  /* ------------------------------------------------------- projection ---- */

  var DIST = 3.1;                                     // camera distance

  function project(p, yaw, pitch, cx, cy, scale) {
    var cy_ = Math.cos(yaw), sy = Math.sin(yaw);
    var x = p[0] * cy_ + p[2] * sy;
    var z = -p[0] * sy + p[2] * cy_;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y = p[1] * cp - z * sp;
    z = p[1] * sp + z * cp;
    var k = DIST / (DIST - z);
    return [cx + x * k * scale, cy - y * k * scale, z];
  }

  /* A two-part beat: a strong contraction, a weaker one just after it, then
     a long rest. A plain sine reads as breathing, not as a heart. */
  function beat(t) {
    var u = (t * 0.62) % 1;
    var a = Math.exp(-((u - 0.02) * (u - 0.02)) / 0.0016);
    var b = 0.55 * Math.exp(-((u - 0.19) * (u - 0.19)) / 0.0016);
    return Math.min(1, a + b);
  }

  /* ---------------------------------------------------------- normalise ---- */
  /* The four meshes were each authored to their own convenient dimensions --
     the ball is a unit sphere, the rings span about 0.7, the flutes are tall
     and narrow -- so one shared scale factor drew them at four different
     apparent sizes.

     A bounding sphere is the obvious normaliser and the wrong one: it
     equalises the worst case, and only the ball actually fills its own
     sphere, so the ball still came out a fifth larger than the rest. What
     the eye compares is the PROJECTED extent, so that is what is measured
     here: the drawing is projected at a ring of yaws and each pose's half
     extent recorded. The MEAN of those is the normaliser -- taking the
     largest instead just equalises the one moment each mark is widest,
     which left the heart looking small for the rest of its turn. The target
     keeps enough margin that the widest pose still does not touch an edge,
     and that is checked rather than assumed. */
  var EXT_SAMPLES = 12;

  function extentOf(mesh) {
    var sum = 0, max = 1e-6, here = 1e-6, s, i, j, pts, q, yaw;
    var pitch = 0.22 + (mesh.tiltX || 0);

    function take(p) {
      q = project(p, yaw, pitch, 0, 0, 1);
      if (Math.abs(q[0]) > here) here = Math.abs(q[0]);
      if (Math.abs(q[1]) > here) here = Math.abs(q[1]);
    }

    for (s = 0; s < EXT_SAMPLES; s++) {
      yaw = YAW0 + TAU * s / EXT_SAMPLES;
      here = 1e-6;
      for (i = 0; i < mesh.lines.length; i++) {
        pts = mesh.lines[i];
        for (j = 0; j < pts.length; j++) take(pts[j]);
      }
      if (mesh.dots) for (i = 0; i < mesh.dots.length; i++) take(mesh.dots[i]);
      sum += here;
      if (here > max) max = here;
    }
    var mean = sum / EXT_SAMPLES;
    /* the heart swells on the beat; leave it the room to do that */
    if (mesh.pulse) { mean *= 1.06; max *= 1.06; }
    return { mean: mean, max: max };
  }

  /* ------------------------------------------------------------ mount ---- */

  function mount(canvas, opt) {
    opt = opt || {};
    var mesh = (SHAPES[opt.shape] || ball)();
    var color = opt.color || '#ffffff';
    var speed = opt.speed == null ? 1 : opt.speed;
    /* How much of the canvas the mesh should take, measured against its own
       bounding sphere rather than against whatever units it was authored in.
       1 seats the sphere inside the canvas with a margin; the cover pushes
       past it so the flutes run to the edges. */
    var fill = opt.fill == null ? 1 : opt.fill;
    /* at fill 1 every mark averages the same 78% of the canvas's short side,
       whatever shape it is. The second term is the guard: if the widest pose
       in the turn would then run past the canvas, the whole mark is stepped
       down until it fits, so normalising can never cause a clip. */
    var ext = extentOf(mesh);
    var unit = Math.min(0.39 / ext.mean, 0.485 / ext.max);
    var ctx = canvas.getContext('2d');
    var w = 0, h = 0, dpr = 1;

    /* The halo colour for occlusion: the field the canvas sits on. Taken
       from the panel rather than hard-coded, so recolouring the system does
       not leave a stale colour behind here. */
    var bg = opt.bg;
    if (!bg && mesh.occlude) {
      var host = canvas.parentElement;
      while (host && !bg) {
        var c = global.getComputedStyle(host).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c)) bg = c;
        host = host.parentElement;
      }
      bg = bg || '#ffffff';
    }

    function size() {
      var r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      /* These are decorative line drawings behind type, and the cover one can
         be most of a wide window. Full device resolution on a canvas that big
         costs far more than it shows, so the backing store is capped. */
      dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      dpr = Math.min(dpr, MAX_PX / Math.max(w, h));
      dpr = Math.max(0.6, dpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var segs = [];                                    // reused, not reallocated
    var paths = [];

    function draw(yaw, pitch, t) {
      ctx.clearRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2;
      var scale = Math.min(w, h) * unit * fill;
      var i, j, b, pts, prev, cur, depth;

      if (mesh.pulse) scale *= 1 + 0.055 * beat(t);
      if (mesh.tiltX) pitch += mesh.tiltX;

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;

      if (mesh.occlude) {
        /* Two linked bands only read as linked if the near one visibly cuts
           the far one. There are no surfaces to hide behind, so each segment
           is stroked twice -- once fat in the field colour, once in the ink
           -- and the whole set is drawn far to near. The fat pass erases
           whatever is already behind it, which is the occlusion. */
        var n = 0;
        for (i = 0; i < mesh.lines.length; i++) {
          pts = mesh.lines[i];
          prev = project(pts[0], yaw, pitch, cx, cy, scale);
          for (j = 1; j < pts.length; j++) {
            cur = project(pts[j], yaw, pitch, cx, cy, scale);
            var sl = segs[n] || (segs[n] = [0, 0, 0, 0, 0]);
            sl[0] = prev[0]; sl[1] = prev[1];
            sl[2] = cur[0];  sl[3] = cur[1];
            sl[4] = (prev[2] + cur[2]) / 2;
            n++;
            prev = cur;
          }
        }
        segs.length = n;
        segs.sort(function (p, q) { return p[4] - q[4]; });   // far first

        /* Order has to hold for the occlusion to work, so this cannot be
           bucketed by depth the way the plain pass is. It is chunked
           instead: the sorted run is cut into CHUNKS slices and each slice
           drawn as two paths. Ordering between slices is exact, and within
           a slice the segments are near enough in depth not to matter. */
        var CHUNKS = 14, per = Math.ceil(segs.length / CHUNKS), from, to;
        for (b = 0; b < CHUNKS; b++) {
          from = b * per; to = Math.min(segs.length, from + per);
          if (from >= to) break;
          var halo = new Path2D(), ink = new Path2D();
          for (i = from; i < to; i++) {
            var sg = segs[i];
            halo.moveTo(sg[0], sg[1]); halo.lineTo(sg[2], sg[3]);
            ink.moveTo(sg[0], sg[1]);  ink.lineTo(sg[2], sg[3]);
          }
          depth = (segs[to - 1][4] + 1) / 2;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = bg;
          ctx.lineWidth = 4.2;
          ctx.stroke(halo);
          ctx.globalAlpha = 0.34 + 0.66 * depth;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.7 + 0.8 * depth;
          ctx.stroke(ink);
        }
      } else {

      /* Depth is bucketed rather than continuous. Stroking each segment on
         its own path meant thousands of stroke() calls a frame, which is
         what actually costs -- a few thousand short paths, not the maths.
         Seven buckets are indistinguishable from a smooth ramp and turn
         that into seven strokes. */
      for (b = 0; b < BANDS; b++) paths[b] = paths[b] || new Path2D();
      for (b = 0; b < BANDS; b++) paths[b] = new Path2D();

      for (i = 0; i < mesh.lines.length; i++) {
        pts = mesh.lines[i];
        prev = project(pts[0], yaw, pitch, cx, cy, scale);
        for (j = 1; j < pts.length; j++) {
          cur = project(pts[j], yaw, pitch, cx, cy, scale);
          depth = ((prev[2] + cur[2]) / 2 + 1) / 2;
          b = Math.max(0, Math.min(BANDS - 1, (depth * BANDS) | 0));
          paths[b].moveTo(prev[0], prev[1]);
          paths[b].lineTo(cur[0], cur[1]);
          prev = cur;
        }
      }
      for (b = 0; b < BANDS; b++) {
        depth = (b + 0.5) / BANDS;
        ctx.globalAlpha = 0.20 + 0.78 * depth;
        ctx.lineWidth = 0.55 + 0.75 * depth;
        ctx.stroke(paths[b]);
      }
      }

      if (mesh.dots.length) {
        ctx.fillStyle = color;
        for (i = 0; i < mesh.dots.length; i++) {
          var d = mesh.dots[i];
          cur = project(d, yaw, pitch, cx, cy, scale);
          depth = (cur[2] + 1) / 2;
          var base = 0.18 + 0.7 * depth;
          var rad = 1.05 + 0.5 * depth;

          if (mesh.twinkle) {
            /* Not a per-stud shimmer -- a BALL-WIDE flash, one and a half
               times a second. `env` is the burst envelope, sharp enough to
               sit dark between flashes; `pick` chooses a fresh scatter of
               studs for each burst, so it never flashes the same face twice
               running. Studs turned away from us stay out of it. */
            var cyc = t * FLASH_HZ;
            var shot = Math.floor(cyc);
            var env = Math.pow(Math.max(0, Math.sin(Math.PI * (cyc - shot))), 3);
            /* A tenth of the studs per burst, not a third: the ball should
               catch the light, not strobe. `flashAll` is for the shapes whose
               dots are a handful of deliberate sparkles rather than a field
               of them -- the stone on the ring. */
            var pick = mesh.flashAll
              || ((((i * 1103515245) ^ (shot * 12345)) >>> 4) % 100 < 10);
            var f = pick ? env * depth : 0;

            base = Math.min(1, base + 1.1 * f);
            rad += 2.6 * f;

            if (f > 0.12) {                           // a cross of light
              ctx.globalAlpha = 0.85 * f;
              ctx.strokeStyle = color;
              ctx.lineWidth = 0.9;
              var L = 4 + 13 * f;
              ctx.beginPath();
              ctx.moveTo(cur[0] - L, cur[1]); ctx.lineTo(cur[0] + L, cur[1]);
              ctx.moveTo(cur[0], cur[1] - L); ctx.lineTo(cur[0], cur[1] + L);
              ctx.stroke();
              ctx.globalAlpha = 0.20 * f;             // and a soft halo
              ctx.beginPath();
              ctx.arc(cur[0], cur[1], rad + 4 + 7 * f, 0, TAU);
              ctx.fill();
            }
          }
          ctx.globalAlpha = base;
          ctx.beginPath();
          ctx.arc(cur[0], cur[1], rad, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    var still = global.matchMedia
      && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* A board this long carries nine of these, and animating the ones
       scrolled out of view costs everything and shows nobody anything.

       This FAILS OPEN on purpose. An earlier version started `visible`
       false and waited to be told otherwise, which meant that where the
       observer never fired -- and there are such environments -- nothing
       ever drew at all. An optimisation that can silently blank the thing
       it is optimising is not worth having, so the default is to draw. */
    var visible = true;
    if (global.IntersectionObserver) {
      new global.IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
      }, { rootMargin: '200px' }).observe(canvas);
    }

    size();
    if (still) { draw(YAW0, 0.22, 0.12); }
    else {
      draw(YAW0, 0.22, 0.12);       // one frame up front, before any timing
      var t0 = null, last = -1e9;
      (function frame(t) {
        if (t0 === null) t0 = t;
        if (visible && t - last >= 1000 / FPS) {
          last = t;
          var e = (t - t0) / 1000;
          draw(YAW0 + e * 0.22 * speed, 0.22 + Math.sin(e * 0.31 * speed) * 0.16, e);
        }
        global.requestAnimationFrame(frame);
      })(performance.now());
    }

    var rt;
    global.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { size(); if (still) draw(YAW0, 0.22, 0.12); }, 120);
    });
  }

  /* Anything with [data-wire] mounts itself. */
  function auto() {
    var els = document.querySelectorAll('canvas[data-wire]');
    for (var i = 0; i < els.length; i++) {
      mount(els[i], {
        shape: els[i].getAttribute('data-wire'),
        color: els[i].getAttribute('data-color') || '#fff',
        speed: parseFloat(els[i].getAttribute('data-speed') || '1'),
        fill: parseFloat(els[i].getAttribute('data-fill') || '1'),
        bg: els[i].getAttribute('data-bg') || null
      });
    }
  }

  global.Wire = { mount: mount, auto: auto };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', auto);
  else auto();

})(window);
