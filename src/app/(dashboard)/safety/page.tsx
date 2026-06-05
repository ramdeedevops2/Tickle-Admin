"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Ban, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function SafetyPage() {
  const reports = [
    { id: "1", reporter: "Jordan T.", reported: "Alex M.", reason: "Inappropriate Messages", status: "pending", severity: "high", time: "1 hour ago" },
    { id: "2", reporter: "Sam K.", reported: "Jamie L.", reason: "Fake Profile / Catfishing", status: "investigating", severity: "medium", time: "3 hours ago" },
    { id: "3", reporter: "System", reported: "Bot_992", reason: "Spam Behavior Detected", status: "resolved", severity: "high", time: "1 day ago" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trust & Safety</h2>
          <p className="text-muted-foreground">
            Manage user reports, bans, and platform safety alerts.
          </p>
        </div>
        <Button variant="destructive" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          <Ban className="mr-2 h-4 w-4" />
          Ban User IP
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-destructive/10 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Critical Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">2</div>
            <p className="text-xs text-destructive/80 mt-1">Require immediate action</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">14</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Banned Accounts (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">128</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle>Active Reports</CardTitle>
          <CardDescription>Recent user reports that need moderation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Target User</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id} className="border-border/50">
                  <TableCell className="font-medium">{report.reported}</TableCell>
                  <TableCell className="text-muted-foreground">{report.reporter}</TableCell>
                  <TableCell>{report.reason}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      report.severity === 'high' ? 'border-destructive text-destructive' : 'border-warning text-warning'
                    }>
                      {report.severity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs capitalize text-muted-foreground">
                      {report.status === 'pending' && <AlertTriangle className="h-3 w-3 text-warning" />}
                      {report.status === 'resolved' && <CheckCircle2 className="h-3 w-3 text-success" />}
                      {report.status}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Review</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
