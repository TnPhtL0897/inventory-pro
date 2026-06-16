"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Calendar,
} from "lucide-react";
import { listTable } from "@/lib/data-access";

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  database: string;
  username: string;
}

interface CronRun {
  runid: number;
  jobid: number;
  jobname: string;
  status: "succeeded" | "failed" | "running";
  start_time: string;
  end_time: string | null;
  return_message: string;
}

export default function CronMonitorPage() {
  // Note: cron.job + cron.job_run_details chỉ query được bằng service_role key
  // Trong dev mock, trả về data mẫu
  const { data: jobs, isLoading: jl } = useQuery({
    queryKey: ["cron-jobs"],
    queryFn: () => listTable<CronJob>("cron.job", { pageSize: 50 }),
    retry: false,
  });

  const { data: runs, isLoading: rl } = useQuery({
    queryKey: ["cron-runs"],
    queryFn: () => listTable<CronRun>("cron.job_run_details", { pageSize: 20 }),
    retry: false,
  });

  const jobList: CronJob[] = Array.isArray(jobs)
    ? jobs
    : ((jobs as any)?.items ?? MOCK_JOBS);

  const runList: CronRun[] = Array.isArray(runs)
    ? runs
    : ((runs as any)?.items ?? MOCK_RUNS);

  const failedLast24h = runList.filter(
    (r) => r.status === "failed" && Date.now() - new Date(r.start_time).getTime() < 86_400_000
  );
  const succeededLast24h = runList.filter(
    (r) => r.status === "succeeded" && Date.now() - new Date(r.start_time).getTime() < 86_400_000
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-7 w-7" />
          Cron Monitor
        </h1>
        <p className="text-muted-foreground mt-1">
          Theo dõi pg_cron jobs + lịch sử chạy (last 24h)
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobList.filter((j) => j.active).length}
            </div>
            <p className="text-xs text-muted-foreground">
              / {jobList.length} tổng
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Succeeded 24h</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {succeededLast24h.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed 24h</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {failedLast24h.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total runs (last 20)</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runList.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">⚙️ Cron jobs đã đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          {jl ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Job name</th>
                    <th className="px-3 py-2 text-left">Schedule</th>
                    <th className="px-3 py-2 text-left">DB</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobList.map((j) => (
                    <tr key={j.jobid} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{j.jobname}</td>
                      <td className="px-3 py-2 font-mono text-xs">{j.schedule}</td>
                      <td className="px-3 py-2">{j.database}</td>
                      <td className="px-3 py-2 text-center">
                        {j.active ? (
                          <Badge className="bg-green-100 text-green-800">ACTIVE</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">DISABLED</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📜 Lịch sử chạy gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          {rl ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-2">
              {runList.slice(0, 10).map((r) => (
                <div
                  key={r.runid}
                  className="flex items-center justify-between p-2 border rounded-md text-sm"
                >
                  <div className="flex items-center gap-2">
                    {r.status === "succeeded" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {r.status === "failed" && (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    {r.status === "running" && (
                      <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
                    )}
                    <code className="text-xs">{r.jobname}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.start_time).toLocaleString("vi-VN")}
                    {r.end_time && (
                      <span className="ml-2">
                        ({(new Date(r.end_time).getTime() -
                          new Date(r.start_time).getTime()) /
                          1000}
                        s)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const MOCK_JOBS: CronJob[] = [
  {
    jobid: 1,
    jobname: "auto-expire-lots",
    schedule: "30 0 * * *",
    active: true,
    database: "postgres",
    username: "postgres",
  },
  {
    jobid: 2,
    jobname: "check-lot-expirations",
    schedule: "0 6 * * *",
    active: true,
    database: "postgres",
    username: "postgres",
  },
  {
    jobid: 3,
    jobname: "compute-weekly-replenishment",
    schedule: "0 2 * * 1",
    active: true,
    database: "postgres",
    username: "postgres",
  },
];

const MOCK_RUNS: CronRun[] = [
  {
    runid: 100,
    jobid: 1,
    jobname: "auto-expire-lots",
    status: "succeeded",
    start_time: new Date(Date.now() - 8 * 3600_000).toISOString(),
    end_time: new Date(Date.now() - 8 * 3600_000 + 45_000).toISOString(),
    return_message: "OK",
  },
  {
    runid: 101,
    jobid: 2,
    jobname: "check-lot-expirations",
    status: "succeeded",
    start_time: new Date(Date.now() - 2 * 3600_000).toISOString(),
    end_time: new Date(Date.now() - 2 * 3600_000 + 12_000).toISOString(),
    return_message: "OK",
  },
  {
    runid: 102,
    jobid: 3,
    jobname: "compute-weekly-replenishment",
    status: "succeeded",
    start_time: new Date(Date.now() - 3600_000).toISOString(),
    end_time: new Date(Date.now() - 3600_000 + 180_000).toISOString(),
    return_message: "OK",
  },
];
