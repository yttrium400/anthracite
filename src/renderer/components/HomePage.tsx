import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { CommandBar } from './CommandBar';
import { Sparkles } from 'lucide-react';

interface HomePageProps {
    className?: string;
}

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

export function HomePage({ className }: HomePageProps) {
    const [greeting] = useState(getGreeting);

    const handleSearch = (instruction: string) => {
        const input = instruction.trim();
        if (!input) return;
        window.electron?.navigation.navigate(input);
    };

    return (
        <div className={cn(
            "flex flex-col items-center justify-center h-full w-full bg-mesh-dark relative overflow-hidden",
            className
        )}>
            {/* Animated gradient orbs */}
            <div className="absolute inset-0 pointer-events-none">
                <motion.div
                    className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
                    }}
                    animate={{
                        x: [0, 30, -20, 0],
                        y: [0, -20, 15, 0],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
                <motion.div
                    className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
                    style={{
                        background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
                    }}
                    animate={{
                        x: [0, -25, 15, 0],
                        y: [0, 20, -10, 0],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            </div>

            <motion.div
                className="relative w-full max-w-2xl px-6 flex flex-col items-center gap-10 -mt-16"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            >
                {/* Brand / Greeting */}
                <div className="flex flex-col items-center gap-4">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-br from-brand to-accent-violet rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 transition-opacity" />
                        <div className="relative h-20 w-20 rounded-3xl bg-gradient-to-br from-brand to-accent-violet flex items-center justify-center shadow-glow-lg">
                            <Sparkles className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <div className="text-center">
                        <h1 className="text-4xl font-light text-text-primary tracking-tight">
                            {greeting}
                        </h1>
                        <p className="mt-2 text-text-tertiary">
                            Search the web, or let AI browse for you.
                        </p>
                    </div>
                </div>

                {/* Command Bar */}
                <CommandBar
                    onRun={handleSearch}
                    isRunning={false}
                    status={'idle'}
                />
            </motion.div>
        </div>
    );
}
