import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dumbbell, Calendar, BarChart3, ArrowRight, Users, Zap, Shield } from 'lucide-react'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/app')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-lg z-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-6 border border-indigo-100">
            <Zap size={12} />
            The modern coaching platform
          </div>
          <h1 className="text-5xl sm:text-7xl font-extrabold text-slate-900 mb-6 leading-[1.1] tracking-tight">
            Coach smarter,<br />
            <span className="text-indigo-600">train better.</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            One platform for coaching and training. Build workouts, manage clients, track progress &mdash; whether you coach others, get coached, or both.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-semibold text-base cursor-pointer shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-200"
            >
              Start Free
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-7 py-3.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-semibold text-base cursor-pointer"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="border-y border-slate-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-3 sm:gap-8 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-900">Free</div>
              <div className="text-xs text-slate-500 mt-1">No credit card required</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">2-in-1</div>
              <div className="text-xs text-slate-500 mt-1">Coach &amp; train in one account</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">Real-time</div>
              <div className="text-xs text-slate-500 mt-1">Instant workout assignments</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Everything you need</h2>
            <p className="text-slate-500 mt-3 text-lg">Simple tools that get out of your way</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group rounded-2xl border border-slate-200 p-8 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50 transition-all">
              <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <Dumbbell size={20} className="text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Workout Builder</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Create custom workouts with exercises, sets, reps, and rest. Save as templates for easy reuse across clients.
              </p>
            </div>

            <div className="group rounded-2xl border border-slate-200 p-8 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all">
              <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-emerald-100 transition-colors">
                <Calendar size={20} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Smart Scheduling</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Assign workouts to specific dates. Clients see their weekly schedule at a glance with a calendar view.
              </p>
            </div>

            <div className="group rounded-2xl border border-slate-200 p-8 hover:border-amber-200 hover:shadow-lg hover:shadow-amber-50 transition-all">
              <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-amber-100 transition-colors">
                <BarChart3 size={20} className="text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Progress Tracking</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Monitor completion rates, weekly streaks, and workout history. See how your clients are progressing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">How it works</h2>
            <p className="text-slate-500 mt-3 text-lg">Get started in under a minute</p>
          </div>

          <div className="space-y-6">
            {[
              {
                step: '01',
                icon: <Shield size={20} className="text-indigo-600" />,
                title: 'Create your account',
                desc: 'Sign up for free. Every account can coach and train — no separate roles needed.',
              },
              {
                step: '02',
                icon: <Users size={20} className="text-indigo-600" />,
                title: 'Connect with others',
                desc: 'Send invite links to clients, or accept an invite from a coach. Build your network.',
              },
              {
                step: '03',
                icon: <Dumbbell size={20} className="text-indigo-600" />,
                title: 'Build & assign workouts',
                desc: 'Create workout templates, assign them to clients on specific dates, and track their progress.',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 sm:gap-6 items-start bg-white rounded-2xl border border-slate-200 p-5 sm:p-8">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Step {item.step}</div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-slate-500 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4">Ready to get started?</h2>
          <p className="text-slate-500 text-lg mb-10">Join CoachFlow today. Free forever for individuals.</p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-semibold text-lg cursor-pointer shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-200"
          >
            Create Your Free Account
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} CoachFlow
        </div>
      </footer>
    </div>
  )
}
