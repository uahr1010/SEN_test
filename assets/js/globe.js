/* ==========================================================================
   globe.js — 실적 지구본 (three.js)

   assets/img/world-map.jpg 를 입힌 구체 위에 지역별 점을 찍습니다.
   점 크기는 그 지역의 실적 건수에 따라 3단계로 나뉩니다.
   마우스로 끌어 돌릴 수 있고, 점에 대면 지역명과 건수가 뜹니다.

   three.js 나 WebGL 이 없는 환경에서는 조용히 접고 대신 지역 목록만 보여 줍니다.
   (지구본은 장식이고, 실적 숫자가 본체입니다)
   ========================================================================== */
window.SEN = window.SEN || {};

(function (SEN) {
  'use strict';

  /* r160 부터 UMD 빌드(three.min.js)가 제거 예정이라 마지막 안정 버전에 고정합니다.
     올릴 때는 ES 모듈 방식으로 바꿔야 하므로 숫자만 바꾸지 마세요. */
  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.min.js';
  var TEX_URL = 'assets/img/world-map.jpg';
  var D2R = Math.PI / 180;

  /* 라벨을 띄울 시도 (좌표는 시도 중심) */
  var ANCHORS = [
    { name: '서울', lat: 37.55, lng: 126.99 },
    { name: '경기', lat: 37.29, lng: 127.25 },
    { name: '인천', lat: 37.45, lng: 126.62 },
    { name: '충남', lat: 36.52, lng: 126.80 },
    { name: '경남', lat: 35.46, lng: 128.21 },
    { name: '부산', lat: 35.17, lng: 129.06 },
    { name: '제주', lat: 33.38, lng: 126.53 },
    { name: '필리핀', lat: 14.60, lng: 121.00 }
  ];

  var api = { init: init };
  SEN.globe = api;

  function init(data, els) {
    if (!data || !data.regions.length) return Promise.resolve(false);
    return loadThree()
      .then(function () { return build(data, els); })
      .catch(function (err) {
        console.warn('[SEN] 지구본을 띄우지 못했습니다:', err.message);
        els.wrap.classList.add('is-unavailable');
        return false;
      });
  }

  function loadThree() {
    if (window.THREE) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = res;
      s.onerror = function () { rej(new Error('three.js 로드 실패')); };
      document.head.appendChild(s);
    });
  }

  function llToV3(lat, lng, r) {
    var phi = lat * D2R, lam = lng * D2R;
    return new THREE.Vector3(
      r * Math.cos(phi) * Math.sin(lam),
      r * Math.sin(phi),
      r * Math.cos(phi) * Math.cos(lam)
    );
  }

  function build(data, els) {
    var wrap = els.wrap, pillWrap = els.pills, tip = els.tip;
    var R = 1;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    /* fov 34°, z 3.8 → 구체 지름(2)이 화면 높이의 약 85% 를 차지해
       위아래가 잘리지 않고 라벨이 놓일 여백도 남습니다. */
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    var globe = new THREE.Group();
    scene.add(globe);

    var mat = new THREE.MeshBasicMaterial({ color: 0xe2e5eb });
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), mat));

    new THREE.TextureLoader().load(TEX_URL, function (tex) {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.wrapS = THREE.RepeatWrapping;
      /* 등장방형도법은 x=0 이 경도 -180, 구체의 u=0 은 경도 -90 이라 1/4 만큼 밀어 줍니다 */
      tex.offset.x = 0.25;
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });

    /* ---- 실적 점 ---- */
    var dotTex = makeDotTexture();
    var tiers = [[3, 0.016], [10, 0.023], [Infinity, 0.034]];
    var min = 0;
    tiers.forEach(function (t) {
      var pts = data.regions.filter(function (r) { return r.n > min && r.n <= t[0]; })
        .map(function (r) { return llToV3(r.lat, r.lng, R * 1.004); });
      if (pts.length) {
        globe.add(new THREE.Points(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.PointsMaterial({
            size: t[1], map: dotTex, transparent: true, alphaTest: 0.4, color: 0xffffff
          })
        ));
      }
      min = t[0];
    });

    /* ---- 시도 라벨 ---- */
    var pills = ANCHORS.map(function (a) {
      var n = data.byProv[a.name] || 0;
      if (!n) return null;
      var el = document.createElement('div');
      el.className = 'gpill';
      el.innerHTML = a.name + ' <small>' + n + '건</small>';
      pillWrap.appendChild(el);
      return { el: el, v: llToV3(a.lat, a.lng, R * 1.01), tmp: new THREE.Vector3() };
    }).filter(Boolean);

    /* ---- 드래그 회전 ---- */
    var yaw = 0, pitch = 0, dragging = false, lastX = 0, lastY = 0, spin = 0;
    wrap.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      wrap.classList.add('is-dragging');
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.005;
      pitch = Math.max(-1.0, Math.min(1.0, pitch + (e.clientY - lastY) * 0.004));
      lastX = e.clientX; lastY = e.clientY;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      wrap.addEventListener(ev, function () {
        dragging = false;
        wrap.classList.remove('is-dragging');
      });
    });

    /* ---- 점 위에 올리면 지역 정보 ---- */
    var ray = new THREE.Raycaster();
    ray.params.Points.threshold = 0.025;
    wrap.addEventListener('pointermove', function (e) {
      if (dragging) { tip.hidden = true; return; }
      var b = wrap.getBoundingClientRect();
      var mouse = new THREE.Vector2(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        -((e.clientY - b.top) / b.height) * 2 + 1
      );
      ray.setFromCamera(mouse, camera);
      var hit = null, best = Infinity;
      data.regions.forEach(function (r) {
        var v = llToV3(r.lat, r.lng, R * 1.004).applyQuaternion(globe.quaternion);
        if (v.z < 0) return;                       /* 지구 뒤편은 무시 */
        var p = v.clone().project(camera);
        var d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (d < 0.045 && d < best) { best = d; hit = r; }
      });
      if (hit) {
        tip.hidden = false;
        tip.innerHTML = '<strong>' + esc(hit.name) + '</strong><span>' + hit.n + '건</span>';
        tip.style.left = (e.clientX - b.left) + 'px';
        tip.style.top = (e.clientY - b.top) + 'px';
      } else {
        tip.hidden = true;
      }
    });
    wrap.addEventListener('pointerleave', function () { tip.hidden = true; });

    /* ---- 크기 맞추기 ---- */
    function size() {
      var w = wrap.clientWidth || 600, h = wrap.clientHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    size();
    addEventListener('resize', size);
    /* 장면이 숨겨진 채로 초기화되면 이 시점의 폭이 0 입니다.
       나중에 장면이 열려 크기가 잡히는 순간 다시 맞춰 줍니다. */
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(wrap);

    /* ---- 애니메이션 ---- */
    var qKorea = quatFor(30, 127.5);
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var visible = true, last = performance.now();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
      }, { threshold: 0.01 }).observe(wrap);
    }

    function frame(t) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!visible) return;                      /* 화면 밖이면 그리지 않음 */

      if (!dragging) {
        var k = Math.exp(-dt * 0.6);
        yaw *= k; pitch *= k;
        if (!reduce) spin += dt * 0.045;         /* 아주 천천히 자전 */
      }
      var qU = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + spin));
      globe.quaternion.copy(qU.multiply(qKorea));
      renderer.render(scene, camera);

      var w = wrap.clientWidth, h = wrap.clientHeight;
      pills.forEach(function (p) {
        p.tmp.copy(p.v).applyQuaternion(globe.quaternion);
        var front = p.tmp.z > 0.12;
        p.el.style.opacity = front ? '1' : '0';
        if (!front) return;
        var s = p.tmp.clone().project(camera);
        p.el.style.transform = 'translate(-50%,-50%) translate(' +
          ((s.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-s.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
      });
    }
    requestAnimationFrame(frame);
    wrap.classList.add('is-ready');
    return true;
  }

  function quatFor(lat, lng) {
    var qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -lng * D2R);
    var qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lat * D2R);
    return qx.multiply(qy);
  }

  function makeDotTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    x.fillStyle = '#0B5FCE';
    x.beginPath(); x.arc(32, 32, 22, 0, 7); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 8;
    x.beginPath(); x.arc(32, 32, 22, 0, 7); x.stroke();
    return new THREE.CanvasTexture(c);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
})(window.SEN);
