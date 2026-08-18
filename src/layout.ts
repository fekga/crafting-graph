import { createContext, useContext } from 'react'

export type Layout = 'horizontal' | 'vertical'

export const LayoutContext = createContext<Layout>('horizontal')

export function useLayout() {
  return useContext(LayoutContext)
}
