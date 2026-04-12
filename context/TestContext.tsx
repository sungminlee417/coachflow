'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface TestContextType {
  count: number
  increment: () => void
  decrement: () => void
  reset: () => void
}

const TestContext = createContext<TestContextType | undefined>(undefined)

export function TestProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0)

  const increment = () => setCount((prev) => prev + 1)
  const decrement = () => setCount((prev) => prev - 1)
  const reset = () => setCount(0)

  return (
    <TestContext.Provider value={{ count, increment, decrement, reset }}>
      {children}
    </TestContext.Provider>
  )
}

export function useTestContext() {
  const context = useContext(TestContext)
  if (!context) {
    throw new Error('useTestContext must be used within a TestProvider')
  }
  return context
}
