import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface Props {
  onBack: () => void
}

export default function Signup({ onBack }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join waitlist')
    } finally {
      setLoading(false)
    }
  }

  const isValid = email.trim().length > 0

  return (
    <div className="relative min-h-screen bg-[#0A0A0B] overflow-hidden">
      {/* Background — same as landing */}
      <div className="earth-horizon" />
      <div className="earth-horizon-glow" />

      <motion.div
        className="absolute top-[20%] left-[35%] w-[500px] h-[500px] rounded-xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.025) 0%, transparent 70%)',
        }}
        animate={{ x: [0, 15, -10, 0], y: [0, -10, 8, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        <motion.div
          className="w-full max-w-[340px] -mt-16"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Back */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-200 mb-12"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Back</span>
          </button>

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="done"
                className="flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="font-display text-[22px] font-extralight text-text-primary/90 tracking-tight mb-3">
                  You're on the list.
                </h2>
                <p className="text-sm text-text-tertiary font-light leading-relaxed">
                  We'll reach out when Anthracite is ready.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                className="flex flex-col"
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* Header */}
                <h2 className="font-display text-[22px] font-extralight text-text-primary/90 tracking-tight mb-2">
                  Get early access
                </h2>
                <p className="text-[13px] text-text-tertiary font-light mb-10">
                  We'll let you know when it's ready.
                </p>

                {/* Fields */}
                <div className="flex flex-col gap-7">
                  <div>
                    <label className="block text-[11px] font-medium tracking-wide uppercase text-white/35 mb-3">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-transparent text-sm text-text-primary placeholder:text-white/20 pb-2 border-b border-white/[0.10] focus:border-white/25 focus:outline-none transition-colors duration-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium tracking-wide uppercase text-white/35 mb-3">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-transparent text-sm text-text-primary placeholder:text-white/20 pb-2 border-b border-white/[0.10] focus:border-white/25 focus:outline-none transition-colors duration-300"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium tracking-wide uppercase text-white/35 mb-3">
                      What do you do?
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="Optional"
                      className="w-full bg-transparent text-sm text-text-primary placeholder:text-white/20 pb-2 border-b border-white/[0.10] focus:border-white/25 focus:outline-none transition-colors duration-300"
                    />
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs mt-4 text-center"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={!isValid || loading}
                  className="group flex items-center justify-center gap-2 mt-8 px-5 py-2.5 rounded-xl border border-white/[0.10] text-sm text-text-secondary hover:border-white/[0.20] hover:text-text-primary disabled:opacity-30 disabled:hover:border-white/[0.10] disabled:hover:text-text-secondary transition-all duration-300"
                  whileHover={isValid && !loading ? { scale: 1.02 } : {}}
                  whileTap={isValid && !loading ? { scale: 0.98 } : {}}
                >
                  <span className="font-light">{loading ? 'Joining...' : 'Submit'}</span>
                  {!loading && (
                    <ArrowRight className="h-3.5 w-3.5 text-text-tertiary group-hover:text-text-secondary transition-colors duration-300" />
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-7">
          <p className="text-[11px] text-white/20 font-light">&copy; 2025 Anthracite</p>
        </div>
      </div>
    </div>
  )
}
