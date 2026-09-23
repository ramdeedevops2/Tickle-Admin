"use client";

import { PageHeader } from "@/components/ui/page";
import { CoffeeKindsPanel } from "@/components/coffee/CoffeeKindsPanel";

/**
 * Coffee Date.
 *
 * Someone posts that they are at a place and up for something, and
 * people nearby can ask to join. This screen sets the "up for something"
 * part: the list of options the post sheet offers.
 *
 * It is a settings screen, not a monitor — the posts themselves are
 * short-lived and live under Connections. What is here changes what
 * every phone shows the next time someone opens the sheet.
 */
export default function CoffeeDatePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Coffee Date"
        description="The options people choose from when they post that they are out somewhere."
      />

      <CoffeeKindsPanel />
    </div>
  );
}
