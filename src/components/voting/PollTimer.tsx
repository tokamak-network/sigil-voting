/**
 * PollTimer - Voting Deadline Countdown
 *
 * Reads getDeployTimeAndDuration() from the Poll contract
 * and shows a live countdown to the voting deadline.
 */

import { useState, useEffect, useRef } from 'react';
import { useReadContract } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface PollTimerProps {
  pollAddress: `0x${string}`;
  onExpired?: () => void;
}

export function PollTimer({ pollAddress, onExpired }: PollTimerProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const expiredFiredRef = useRef(false);

  const { data: timeData } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getDeployTimeAndDuration',
  });

  const deployTime = timeData ? Number((timeData as [bigint, bigint])[0]) : 0;
  const duration = timeData ? Number((timeData as [bigint, bigint])[1]) : 0;
  const deadline = deployTime + duration;
  const remaining = deadline - now;
  const expired = timeData ? remaining <= 0 : false;

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Notify parent when timer reaches zero (fire only once)
  useEffect(() => {
    if (expired && onExpired && !expiredFiredRef.current) {
      expiredFiredRef.current = true;
      onExpired();
    }
  }, [expired, onExpired]);

  if (!timeData) return null;

  if (expired) {
    return (
      <div className="text-center py-4" role="timer" aria-label={t.timer.ended}>
        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">timer_off</span>
        <p className="font-display font-bold text-lg uppercase text-slate-500">{t.timer.ended}</p>
      </div>
    );
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div role="timer" aria-live="polite">
      <h4 className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400 mb-8 text-center">{t.timer.remaining}</h4>
      <div className="flex justify-center items-center gap-8">
        <div className="text-center">
          <span className="text-7xl lg:text-8xl font-mono font-bold text-primary tracking-tighter">{pad(hours)}</span>
          <span className="block text-xs font-bold text-slate-400 uppercase mt-2">{t.timer.hours}</span>
        </div>
        <span className="text-6xl font-mono font-bold text-slate-300 mb-6">:</span>
        <div className="text-center">
          <span className="text-7xl lg:text-8xl font-mono font-bold text-primary tracking-tighter">{pad(minutes)}</span>
          <span className="block text-xs font-bold text-slate-400 uppercase mt-2">{t.timer.minutes}</span>
        </div>
        <span className="text-6xl font-mono font-bold text-slate-300 mb-6">:</span>
        <div className="text-center">
          <span className="text-7xl lg:text-8xl font-mono font-bold text-primary tracking-tighter">{pad(seconds)}</span>
          <span className="block text-xs font-bold text-slate-400 uppercase mt-2">{t.timer.seconds}</span>
        </div>
      </div>
    </div>
  );
}
