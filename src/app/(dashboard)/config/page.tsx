"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ConfigPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Config</h1>
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">Platform Core Variables</p>
        </div>
        <Button className="h-12 bg-foreground text-background hover:bg-muted-foreground transition-colors rounded-none text-xs font-bold uppercase tracking-[0.2em] px-8">
          Save Memory
        </Button>
      </div>

      <div className="space-y-12">
        {/* Section 1 */}
        <div className="space-y-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border/50 pb-2">Matching Algorithm</h2>
          
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3 group">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                Max Distance (KM)
              </label>
              <Input
                defaultValue="150"
                className="h-14 bg-transparent border-0 border-b border-border/50 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl font-mono transition-all"
              />
            </div>
            <div className="space-y-3 group">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                Age Variance (+/- Years)
              </label>
              <Input
                defaultValue="5"
                className="h-14 bg-transparent border-0 border-b border-border/50 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl font-mono transition-all"
              />
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="space-y-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border/50 pb-2">System Limits</h2>
          
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3 group">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                Daily Swipes (Free)
              </label>
              <Input
                defaultValue="50"
                className="h-14 bg-transparent border-0 border-b border-border/50 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl font-mono transition-all"
              />
            </div>
            <div className="space-y-3 group">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
                Daily Swipes (Premium)
              </label>
              <Input
                defaultValue="9999"
                className="h-14 bg-transparent border-0 border-b border-border/50 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl font-mono transition-all"
              />
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="space-y-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border/50 pb-2">Security</h2>
          
          <div className="flex items-center justify-between border border-border/50 p-6">
            <div>
              <div className="font-mono text-sm text-foreground">Require Biometric Verification</div>
              <div className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">Enforce FaceID/TouchID on app launch</div>
            </div>
            <Button variant="outline" className="rounded-none border-foreground text-foreground hover:bg-foreground hover:text-background text-xs tracking-widest uppercase">
              Enabled
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
