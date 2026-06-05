"use client";

export default function GeoPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">
          Geo
        </h1>
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
          User Geography & Regions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 border border-border/50 h-[600px] relative overflow-hidden flex items-center justify-center bg-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:16px_16px]"></div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground z-10 border border-border/50 px-4 py-2 bg-black">
            Map Interface Offline (Awaiting API)
          </span>
        </div>

        <div className="border border-border/50 p-6 flex flex-col">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">
            Top Regions
          </h2>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2">
            {[
              { city: "New York, USA", active: 2450, percentage: 85 },
              { city: "London, UK", active: 1820, percentage: 70 },
              { city: "Los Angeles, USA", active: 1540, percentage: 65 },
              { city: "Tokyo, JPN", active: 1200, percentage: 50 },
              { city: "Berlin, GER", active: 980, percentage: 40 },
              { city: "Paris, FRA", active: 850, percentage: 35 },
              { city: "Toronto, CAN", active: 720, percentage: 30 },
            ].map((region, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-foreground">{region.city}</span>
                  <span className="text-muted-foreground">
                    {region.active} ACT
                  </span>
                </div>
                <div className="h-1 w-full bg-border/30">
                  <div
                    className="h-full bg-foreground"
                    style={{ width: `${region.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
