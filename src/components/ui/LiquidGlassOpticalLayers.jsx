export default function LiquidGlassOpticalLayers() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] backdrop-blur-[2px] backdrop-brightness-[1.16] backdrop-saturate-[240%]"
        style={{
          WebkitMaskImage:
            "radial-gradient(112% 128% at 50% 50%, transparent 34%, #000 92%)",
          maskImage:
            "radial-gradient(115% 135% at 50% 50%, transparent 40%, #000 95%)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(125deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.03)_16%,transparent_40%,transparent_60%,rgba(255,255,255,0.03)_86%,rgba(255,255,255,0.07)_100%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.08)_0%,transparent_75%)]"
      />
    </>
  );
}
