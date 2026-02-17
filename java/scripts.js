// Navigation Bar Script
const navBar = document.getElementById('navBar');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const navItems = document.querySelectorAll('.nav-item');
const sections = [
  { id: 'header', navIndex: 0 },
  { id: 'editing', navIndex: 1 },
  { id: 'studio3', navIndex: 2 },
  { id: 'today11', navIndex: 3 },
  { id: 'commercials', navIndex: 4 },
  { id: 'motionGraphics', navIndex: 5 },
  { id: 'lifeArt', navIndex: 6 },
  { id: 'about', navIndex: 7 },
  { id: 'contact', navIndex: 8 }
];

// Mobile menu toggle
hamburgerBtn.addEventListener('click', () => {
  navBar.classList.toggle('mobile-open');
  // Hide/show the sticky logo when menu is toggled
  const logoFixed = document.querySelector('.logo-fixed');
  if (logoFixed) {
    logoFixed.classList.toggle('hidden');
  }
  // Disable/enable body scroll when menu is open
  document.body.style.overflow = navBar.classList.contains('mobile-open') ? 'hidden' : 'auto';
});

// Close mobile menu when a nav item is clicked
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navBar.classList.remove('mobile-open');
    const logoFixed = document.querySelector('.logo-fixed');
    if (logoFixed) {
      logoFixed.classList.remove('hidden');
    }
    document.body.style.overflow = 'auto';
  });
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile && !navBar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
    navBar.classList.remove('mobile-open');
    const logoFixed = document.querySelector('.logo-fixed');
    if (logoFixed) {
      logoFixed.classList.remove('hidden');
    }
    document.body.style.overflow = 'auto';
  }
});

  // Show nav bar when scrolling down (desktop). Auto-hide after inactivity.
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    
    // Show nav bar after scrolling past the header (only on desktop)
    if (window.innerWidth > 768) {
      if (scrollY > 200) {
        showNavTemporary();
      } else {
        navBar.classList.remove('visible');
      }
    }

    // Highlight active nav item
    sections.forEach(section => {
      const element = document.getElementById(section.id);
      if (!element) return;
      
      const rect = element.getBoundingClientRect();
      
      if (rect.top <= 150 && rect.bottom >= 150) {
        navItems.forEach(item => item.classList.remove('active'));
        if (navItems[section.navIndex]) {
          navItems[section.navIndex].classList.add('active');
        }
      }
    });
  });

// Smooth scroll for nav items
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = item.getAttribute('href').substring(1);
    const targetElement = document.getElementById(targetId);
    
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

/* Auto-hide nav on desktop when idle
   - showNavTemporary(): shows nav and sets a timeout to hide
   - desktop only (window.innerWidth > 768)
*/
let navHideTimer = null;
const NAV_HIDE_DELAY = 1500; // ms

function userIsDesktop() {
  return window.innerWidth > 768;
}

function showNavTemporary() {
  if (!userIsDesktop()) return;
  navBar.classList.add('visible');
  if (navHideTimer) clearTimeout(navHideTimer);
  navHideTimer = setTimeout(() => {
    navBar.classList.remove('visible');
    navHideTimer = null;
  }, NAV_HIDE_DELAY);
}

// Reset/hide behavior on user input
// Only wake nav when mouse is in the vicinity of the right-edge nav (desktop only)
document.addEventListener('mousemove', (e) => {
  if (!userIsDesktop()) return;
  const thresholdX = 220; // px from right edge
  const centerY = window.innerHeight / 2;
  const thresholdY = Math.max(120, window.innerHeight * 0.35);
  const nearRight = e.clientX >= (window.innerWidth - thresholdX);
  const nearVert = Math.abs(e.clientY - centerY) <= thresholdY;
  if (nearRight && nearVert) showNavTemporary();
});
document.addEventListener('keydown', () => { showNavTemporary(); });
document.addEventListener('touchstart', () => { if (!userIsDesktop()) navBar.classList.add('visible'); });

window.addEventListener('resize', () => {
  if (!userIsDesktop()) {
    navBar.classList.remove('visible');
    if (navHideTimer) clearTimeout(navHideTimer);
  } else {
    // Restore scrolling when resizing to desktop
    document.body.style.overflow = 'auto';
    navBar.classList.remove('mobile-open');
    const logoFixed = document.querySelector('.logo-fixed');
    if (logoFixed) {
      logoFixed.classList.remove('hidden');
    }
  }
});

navBar.addEventListener('mouseenter', () => {
  if (!userIsDesktop()) return;
  if (navHideTimer) clearTimeout(navHideTimer);
  navBar.classList.add('visible');
});

navBar.addEventListener('mouseleave', () => {
  if (!userIsDesktop()) return;
  if (navHideTimer) clearTimeout(navHideTimer);
  navHideTimer = setTimeout(() => navBar.classList.remove('visible'), NAV_HIDE_DELAY);
});

document.querySelectorAll(".media").forEach(media => {
  const video = media.querySelector("video");
  const button = media.querySelector(".mute-toggle");
  if (!video || !button) return;

  // autoplay when visible
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    },
    { threshold: 0.6 }
  );

  observer.observe(video);

  // set initial button state (🔇 = muted, 🔊 = unmuted)
  const updateButton = () => {
    const icon = video.muted ? "🔇" : "🔊";
    button.textContent = icon;
    const label = video.muted ? "Unmute video" : "Mute video";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", String(!video.muted));
  };

  updateButton();

  // toggle audio on user interaction
  button.addEventListener("click", e => {
    e.stopPropagation();
    video.muted = !video.muted;

    if (!video.muted) {
      video.volume = 1;
      video.play().catch(() => {});
    }

    updateButton();
  });
});

// Scroll-triggered animation for person placeholder
const personPlaceholder = document.querySelector('.person-placeholder');
const aboutSection = document.querySelector('#about');

if (personPlaceholder && aboutSection) {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        personPlaceholder.classList.add('visible');
      } else {
        personPlaceholder.classList.remove('visible');
      }
    },
    { threshold: 0.1 }
  );
  
  observer.observe(aboutSection);
}