"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Activity, LogIn, AlertTriangle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
      } else {
        router.push("/");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 size-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Activity className="size-5 text-primary" />
        </div>
        <CardTitle className="text-xl font-semibold tracking-tight">
          Kast
        </CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <Separator className="mb-1" />
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2">
              <AlertTriangle className="size-3.5 text-critical shrink-0" />
              <p className="text-xs text-critical">{error}</p>
            </div>
          )}

          <Button type="submit" size="sm" className="w-full" disabled={loading}>
            {loading ? (
              "Signing in..."
            ) : (
              <>
                <LogIn className="size-3.5 mr-1.5" />
                Sign in
              </>
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-5">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
    </motion.div>
  );
}
