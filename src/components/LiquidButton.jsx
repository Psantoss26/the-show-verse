"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * LiquidButton: Botón con efecto de gotas/cristal líquido
 * Con interacción mejorada entre botones, trail effect y explosión optimizada
 */
export default function LiquidButton({
  children,
  onClick,
  disabled = false,
  active = false,
  className = "",
  title = "",
  activeColor = "blue",
  loading = false,
  groupId = "default",
  ...props
}) {
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState([]);
  const [proximityGlow, setProximityGlow] = useState(0);
  const [isExploding, setIsExploding] = useState(false);
  const animationFrameRef = useRef(null);
  const particlesRef = useRef([]);
  const explosionParticlesRef = useRef([]);
  const trailPointsRef = useRef([]);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Colores usando arrays RGB para facilitar conversión a rgba
  const colors = {
    blue: {
      rgb: [59, 130, 246],
      secondary: [147, 197, 253],
      glow: "rgba(59, 130, 246, 0.5)",
    },
    red: {
      rgb: [239, 68, 68],
      secondary: [252, 165, 165],
      glow: "rgba(239, 68, 68, 0.5)",
    },
    yellow: {
      rgb: [234, 179, 8],
      secondary: [253, 224, 71],
      glow: "rgba(234, 179, 8, 0.5)",
    },
    purple: {
      rgb: [168, 85, 247],
      secondary: [216, 180, 254],
      glow: "rgba(168, 85, 247, 0.5)",
    },
    green: {
      rgb: [34, 197, 94],
      secondary: [134, 239, 172],
      glow: "rgba(34, 197, 94, 0.5)",
    },
    teal: {
      rgb: [20, 184, 166],
      secondary: [153, 246, 228],
      glow: "rgba(20, 184, 166, 0.5)",
    },
    orange: {
      rgb: [249, 115, 22],
      secondary: [253, 186, 116],
      glow: "rgba(249, 115, 22, 0.5)",
    },
  };

  const currentColors = colors[activeColor] || colors.blue;

  // Helper para convertir RGB a rgba
  const toRgba = (rgb, alpha) =>
    `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

  // Generar partículas flotantes
  const generateParticles = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    particlesRef.current = Array.from({ length: 12 }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      size: Math.random() * 4 + 1.5,
      opacity: Math.random() * 0.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  // Crear efecto de gota/ondulación
  const createRipple = useCallback((x, y, intensity = 0.8, maxRadius = 100) => {
    const id = Date.now() + Math.random();
    const newRipple = {
      id,
      x,
      y,
      radius: 0,
      maxRadius,
      opacity: intensity,
      speed: 2.5,
    };

    setRipples((prev) => [...prev, newRipple]);

    // Eliminar después de la animación
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 1000);
  }, []);

  // Crear efecto de explosión optimizado
  const createExplosion = useCallback((x, y) => {
    const particles = [];
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 2.5 + Math.random() * 3;
      const size = 2 + Math.random() * 3;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        opacity: 1,
        decay: 0.025 + Math.random() * 0.015,
      });
    }

    explosionParticlesRef.current = particles;
    setIsExploding(true);

    setTimeout(() => {
      explosionParticlesRef.current = [];
      setIsExploding(false);
    }, 800);
  }, []);

  // Propagar evento a otros botones del grupo
  const propagateToGroup = useCallback(
    (eventType, detail) => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const event = new CustomEvent(`liquid-${eventType}`, {
        detail: {
          ...detail,
          sourceX: rect.left + rect.width / 2,
          sourceY: rect.top + rect.height / 2,
          color: toRgba(currentColors.rgb, 1),
          groupId,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    },
    [currentColors, toRgba, groupId],
  );

  // Escuchar eventos de otros botones
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleLiquidSpread = (e) => {
      if (e.detail.groupId !== groupId) return;

      const rect = button.getBoundingClientRect();
      const buttonX = rect.left + rect.width / 2;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(
        e.detail.sourceX - buttonX,
        e.detail.sourceY - buttonY,
      );

      if (distance < 300 && distance > 0) {
        const delay = distance * 0.3;
        const intensity = Math.max(0.2, 0.8 - distance / 400);
        setTimeout(() => {
          createRipple(rect.width / 2, rect.height / 2, intensity, 80);
        }, delay);
      }
    };

    const handleLiquidClick = (e) => {
      if (e.detail.groupId !== groupId) return;

      const rect = button.getBoundingClientRect();
      const buttonX = rect.left + rect.width / 2;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(
        e.detail.sourceX - buttonX,
        e.detail.sourceY - buttonY,
      );

      if (distance < 400 && distance > 0) {
        const delay = distance * 0.8;
        const intensity = Math.max(0.3, 1 - distance / 500);
        setTimeout(() => {
          createRipple(rect.width / 2, rect.height / 2, intensity, 120);
          setTimeout(() => {
            createRipple(rect.width / 2, rect.height / 2, intensity * 0.6, 90);
          }, 100);
        }, delay);
      }
    };

    const handleLiquidProximity = (e) => {
      if (e.detail.groupId !== groupId || disabled) return;

      const rect = button.getBoundingClientRect();
      const buttonX = rect.left + rect.width / 2;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(
        e.detail.mouseX - buttonX,
        e.detail.mouseY - buttonY,
      );

      const maxDistance = 200;
      if (distance < maxDistance) {
        const intensity = 1 - distance / maxDistance;
        setProximityGlow(intensity * 0.6);
      } else {
        setProximityGlow(0);
      }
    };

    document.addEventListener("liquid-spread", handleLiquidSpread);
    document.addEventListener("liquid-click", handleLiquidClick);
    document.addEventListener("liquid-proximity", handleLiquidProximity);

    return () => {
      document.removeEventListener("liquid-spread", handleLiquidSpread);
      document.removeEventListener("liquid-click", handleLiquidClick);
      document.removeEventListener("liquid-proximity", handleLiquidProximity);
    };
  }, [createRipple, groupId, disabled]);

  // Animación del canvas optimizada
  useEffect(() => {
    if (!isHovered && !active && proximityGlow === 0 && !isExploding) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    if (particlesRef.current.length === 0) {
      generateParticles();
    }

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.016;

      // Dibujar partículas de explosión optimizadas
      const expParticles = explosionParticlesRef.current;
      if (expParticles.length > 0) {
        const validParticles = [];
        for (let i = 0; i < expParticles.length; i++) {
          const particle = expParticles[i];
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.vy += 0.12;
          particle.opacity -= particle.decay;
          particle.vx *= 0.99;

          if (particle.opacity > 0) {
            validParticles.push(particle);

            ctx.fillStyle = toRgba(currentColors.rgb, particle.opacity * 0.9);
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = toRgba(
              currentColors.secondary,
              particle.opacity * 0.4,
            );
            ctx.beginPath();
            ctx.arc(
              particle.x - particle.vx * 0.5,
              particle.y - particle.vy * 0.5,
              particle.size * 0.6,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }
        explosionParticlesRef.current = validParticles;
      }

      // Dibujar trail points optimizados
      const validTrails = [];
      for (let i = 0; i < trailPointsRef.current.length; i++) {
        const point = trailPointsRef.current[i];
        point.life -= 0.025;

        if (point.life > 0) {
          validTrails.push(point);
          ctx.fillStyle = toRgba(currentColors.secondary, point.life * 0.5);
          ctx.beginPath();
          ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      trailPointsRef.current = validTrails;

      // Dibujar ondulaciones
      ripples.forEach((ripple) => {
        ripple.radius += ripple.speed;
        ripple.opacity = Math.max(
          0,
          ripple.opacity * (1 - ripple.radius / ripple.maxRadius),
        );

        const gradient = ctx.createRadialGradient(
          ripple.x,
          ripple.y,
          0,
          ripple.x,
          ripple.y,
          ripple.radius,
        );
        gradient.addColorStop(0, toRgba(currentColors.rgb, ripple.opacity));
        gradient.addColorStop(
          0.5,
          toRgba(currentColors.secondary, ripple.opacity * 0.5),
        );
        gradient.addColorStop(1, "transparent");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Dibujar partículas ambientales
      if (isHovered || active || proximityGlow > 0) {
        particlesRef.current.forEach((particle) => {
          particle.x += particle.vx + Math.sin(time * 2 + particle.phase) * 0.4;
          particle.y += particle.vy + Math.cos(time * 2 + particle.phase) * 0.4;

          if (particle.x < 0 || particle.x > rect.width) particle.vx *= -1;
          if (particle.y < 0 || particle.y > rect.height) particle.vy *= -1;

          particle.x = Math.max(0, Math.min(rect.width, particle.x));
          particle.y = Math.max(0, Math.min(rect.height, particle.y));

          const particleOpacity =
            particle.opacity * (isHovered || active ? 1 : proximityGlow * 1.5);

          const gradient = ctx.createRadialGradient(
            particle.x,
            particle.y,
            0,
            particle.x,
            particle.y,
            particle.size * 2,
          );
          gradient.addColorStop(
            0,
            toRgba(currentColors.secondary, particleOpacity),
          );
          gradient.addColorStop(1, "transparent");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isHovered,
    active,
    ripples,
    proximityGlow,
    isExploding,
    currentColors,
    generateParticles,
    toRgba,
  ]);

  const handleMouseMove = (e) => {
    if (disabled) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    lastMousePosRef.current = { x, y };

    if (Math.random() > 0.75 && trailPointsRef.current.length < 15) {
      trailPointsRef.current.push({
        x,
        y,
        size: Math.random() * 3 + 1.5,
        life: 1,
      });
    }

    if (Math.random() > 0.9) {
      createRipple(x, y, 0.4, 60);
    }

    propagateToGroup("proximity", {
      mouseX: e.clientX,
      mouseY: e.clientY,
    });

    if (Math.random() > 0.85) {
      propagateToGroup("spread", {});
    }
  };

  const handleMouseEnter = (e) => {
    if (disabled) return;
    setIsHovered(true);
    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createRipple(x, y, 1, 100);
    propagateToGroup("spread", {});
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setProximityGlow(0);
  };

  const handleClick = (e) => {
    if (disabled || loading) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    createExplosion(x, y);

    createRipple(x, y, 1, 150);
    setTimeout(() => createRipple(x, y, 0.6, 100), 80);

    propagateToGroup("click", {});

    if (onClick) onClick(e);
  };

  const primaryColor = toRgba(currentColors.rgb, 1);
  const secondaryColor = toRgba(currentColors.secondary, 1);
  const bgColor = toRgba(currentColors.rgb, 0.15);
  const hoverScale = isHovered && !disabled ? 1.12 : 1;
  const proximityScale = proximityGlow > 0 ? 1 + proximityGlow * 0.08 : 1;
  const explosionScale = isExploding ? 1.18 : 1;
  const finalScale = Math.max(hoverScale, proximityScale) * explosionScale;

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      disabled={disabled || loading}
      title={title}
      data-liquid-button="true"
      data-group-id={groupId}
      className={`
        relative overflow-hidden
        w-12 h-12 rounded-full
        flex items-center justify-center
        border backdrop-blur-sm
        ${
          disabled
            ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
            : active
              ? "border-opacity-50 bg-opacity-10 shadow-lg"
              : "border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
        }
        ${isExploding ? "" : "transition-all duration-300"}
        ${className}
      `}
      style={{
        transform: `scale(${finalScale}) ${isExploding ? "rotate(3deg)" : ""}`,
        transition: isExploding
          ? "transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)"
          : undefined,
        borderColor: active && !disabled ? primaryColor : undefined,
        backgroundColor: active && !disabled ? bgColor : undefined,
        color: active && !disabled ? secondaryColor : undefined,
        boxShadow:
          (isHovered || active || proximityGlow > 0 || isExploding) && !disabled
            ? `0 0 ${20 + proximityGlow * 30 + (isExploding ? 30 : 0)}px ${currentColors.glow}`
            : undefined,
      }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          opacity:
            isHovered || active
              ? 0.8
              : isExploding
                ? 1
                : Math.max(0.3, proximityGlow),
          transition: "opacity 0.3s",
        }}
      />

      {(isHovered || active || proximityGlow > 0.3 || isExploding) &&
        !disabled && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `linear-gradient(135deg, 
              ${toRgba(currentColors.secondary, 0.2)} 0%, 
              transparent 40%, 
              ${toRgba(currentColors.rgb, 0.1)} 60%, 
              transparent 100%)`,
              animation: isExploding
                ? "liquidExplosionFlash 0.3s ease-out"
                : "liquidShine 3s ease-in-out infinite",
              opacity: isExploding
                ? 1
                : isHovered || active
                  ? 1
                  : proximityGlow,
            }}
          />
        )}

      {(isHovered || active || proximityGlow > 0.2 || isExploding) &&
        !disabled && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${primaryColor}`,
              opacity: 0.3 + proximityGlow * 0.4 + (isExploding ? 0.3 : 0),
              animation: "liquidPulse 2s ease-in-out infinite",
            }}
          />
        )}

      <div className="relative z-10 flex items-center justify-center">
        {children}
      </div>

      <style jsx>{`
        @keyframes liquidShine {
          0%,
          100% {
            transform: translateX(-100%) translateY(-100%) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: translateX(100%) translateY(100%) rotate(180deg);
            opacity: 1;
          }
        }

        @keyframes liquidPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.7;
          }
        }

        @keyframes liquidExplosionFlash {
          0% {
            opacity: 1;
            filter: brightness(1.5);
          }
          40% {
            opacity: 0.85;
            filter: brightness(2);
          }
          100% {
            opacity: 1;
            filter: brightness(1);
          }
        }
      `}</style>
    </button>
  );
}
