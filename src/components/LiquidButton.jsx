"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * LiquidButton: Botón con efecto de gotas/cristal líquido
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
  ...props
}) {
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [ripples, setRipples] = useState([]);
  const animationFrameRef = useRef(null);
  const particlesRef = useRef([]);

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

    particlesRef.current = Array.from({ length: 8 }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  // Crear efecto de gota/ondulación
  const createRipple = useCallback(
    (x, y) => {
      const id = Date.now() + Math.random();
      const newRipple = {
        id,
        x,
        y,
        radius: 0,
        maxRadius: 100,
        opacity: 0.8,
        speed: 2,
      };

      setRipples((prev) => [...prev, newRipple]);

      // Propagar a botones vecinos
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const event = new CustomEvent("liquidSpread", {
          detail: {
            sourceX: rect.left + rect.width / 2,
            sourceY: rect.top + rect.height / 2,
            color: toRgba(currentColors.rgb, 1),
          },
          bubbles: true,
        });
        buttonRef.current.dispatchEvent(event);
      }

      // Eliminar después de la animación
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 1000);
    },
    [currentColors, toRgba],
  );

  // Escuchar propagación de otros botones
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleLiquidSpread = (e) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.hypot(
        e.detail.sourceX - (rect.left + rect.width / 2),
        e.detail.sourceY - (rect.top + rect.height / 2),
      );

      if (distance < 200 && distance > 0) {
        const delay = distance * 0.5;
        setTimeout(() => {
          createRipple(rect.width / 2, rect.height / 2);
        }, delay);
      }
    };

    button.addEventListener("liquidSpread", handleLiquidSpread);
    return () => button.removeEventListener("liquidSpread", handleLiquidSpread);
  }, [createRipple]);

  // Animación del canvas
  useEffect(() => {
    if (!isHovered && !active) {
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

    generateParticles();

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      time += 0.016;

      // Dibujar ondulaciones
      ripples.forEach((ripple) => {
        ripple.radius += ripple.speed;
        ripple.opacity = Math.max(
          0,
          0.8 * (1 - ripple.radius / ripple.maxRadius),
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

      // Dibujar partículas
      if (isHovered || active) {
        particlesRef.current.forEach((particle) => {
          particle.x += particle.vx + Math.sin(time * 2 + particle.phase) * 0.3;
          particle.y += particle.vy + Math.cos(time * 2 + particle.phase) * 0.3;

          if (particle.x < 0 || particle.x > rect.width) particle.vx *= -1;
          if (particle.y < 0 || particle.y > rect.height) particle.vy *= -1;

          particle.x = Math.max(0, Math.min(rect.width, particle.x));
          particle.y = Math.max(0, Math.min(rect.height, particle.y));

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
            toRgba(currentColors.secondary, particle.opacity),
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
  }, [isHovered, active, ripples, currentColors, generateParticles, toRgba]);

  const handleMouseMove = (e) => {
    if (disabled) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (Math.random() > 0.85) {
      createRipple(x, y);
    }
  };

  const handleMouseEnter = (e) => {
    if (disabled) return;
    setIsHovered(true);
    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createRipple(x, y);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = (e) => {
    if (disabled || loading) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createRipple(x, y);

    if (onClick) onClick(e);
  };

  const primaryColor = toRgba(currentColors.rgb, 1);
  const secondaryColor = toRgba(currentColors.secondary, 1);
  const bgColor = toRgba(currentColors.rgb, 0.15);

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
      className={`
        relative overflow-hidden
        w-12 h-12 rounded-full
        flex items-center justify-center
        transition-all duration-300
        border backdrop-blur-sm
        ${
          disabled
            ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
            : active
              ? "border-opacity-50 bg-opacity-10 shadow-lg"
              : "border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
        }
        ${isHovered && !disabled ? "scale-110 shadow-2xl" : "scale-100"}
        ${className}
      `}
      style={{
        borderColor: active && !disabled ? primaryColor : undefined,
        backgroundColor: active && !disabled ? bgColor : undefined,
        color: active && !disabled ? secondaryColor : undefined,
        boxShadow:
          (isHovered || active) && !disabled
            ? `0 0 20px ${currentColors.glow}`
            : undefined,
      }}
      {...props}
    >
      {/* Canvas para efectos líquidos */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          opacity: isHovered || active ? 0.7 : 0,
          transition: "opacity 0.3s",
        }}
      />

      {/* Efecto de cristal */}
      {(isHovered || active) && !disabled && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `linear-gradient(135deg, 
              ${toRgba(currentColors.secondary, 0.2)} 0%, 
              transparent 40%, 
              ${toRgba(currentColors.rgb, 0.1)} 60%, 
              transparent 100%)`,
            animation: "liquidShine 3s ease-in-out infinite",
          }}
        />
      )}

      {/* Borde animado */}
      {(isHovered || active) && !disabled && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            border: `2px solid ${primaryColor}`,
            opacity: 0.3,
            animation: "liquidPulse 2s ease-in-out infinite",
          }}
        />
      )}

      {/* Contenido del botón */}
      <div className="relative z-10 flex items-center justify-center">
        {children}
      </div>

      {/* Estilos de animación */}
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
            transform: scale(1.1);
            opacity: 0.6;
          }
        }
      `}</style>
    </button>
  );
}
