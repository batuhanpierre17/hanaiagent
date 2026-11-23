const lines = [...document.querySelectorAll(".line")];
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

lines.forEach((line) => {
  const words = line.textContent.trim().split(/\s+/);
  line.textContent = "";
  words.forEach((item, index) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = item + (index < words.length - 1 ? " " : "");
    line.appendChild(span);
  });
});

if (reduce || typeof gsap === "undefined") {
  lines.forEach((line) => {
    line.style.opacity = "1";
  });
} else {
  gsap.set(lines, { opacity: 0 });

  let current = -1;
  const waits = [];

  function show(index) {
    if (index === current || index < 0 || index >= lines.length) return;
    const previous = lines[current];
    const next = lines[index];
    current = index;
    const scene = gsap.timeline();
    if (previous) {
      scene.to(previous.querySelectorAll(".w"), {
        rotationX: 82,
        y: -18,
        opacity: 0,
        duration: 0.4,
        stagger: 0.022,
        ease: "power2.in",
      });
      scene.set(previous, { opacity: 0 });
    }
    scene.set(next, { opacity: 1 });
    scene.fromTo(next.querySelectorAll(".w"), {
      rotationX: -88,
      y: 26,
      opacity: 0,
    }, {
      rotationX: 0,
      y: 0,
      opacity: 1,
      duration: 0.72,
      stagger: 0.05,
      ease: "back.out(1.7)",
    });
  }

  let auto = true;
  const holds = [2.8, 3.0, 3.3, 3.2];

  function later(time, fn) {
    const call = gsap.delayedCall(time, fn);
    waits.push(call);
    return call;
  }

  function schedule(index) {
    later(holds[index], () => {
      if (!auto) return;
      const next = (index + 1) % lines.length;
      show(next);
      schedule(next);
    });
  }

  later(window.HANAI_GL ? 4.1 : 1.1, () => {
    if (!auto) return;
    show(0);
    schedule(0);
  });

  function take(direction) {
    if (auto) {
      auto = false;
      waits.forEach((call) => call.kill());
    }
    if (current < 0) {
      show(direction > 0 ? 0 : lines.length - 1);
      return;
    }
    show(Math.max(0, Math.min(lines.length - 1, current + direction)));
  }

  window.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) < 8) return;
    take(event.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  let touchY = 0;
  window.addEventListener("touchstart", (event) => {
    touchY = event.changedTouches[0].clientY;
  }, { passive: true });
  window.addEventListener("touchend", (event) => {
    const delta = touchY - event.changedTouches[0].clientY;
    if (Math.abs(delta) < 30) return;
    take(delta > 0 ? 1 : -1);
  }, { passive: true });
}
