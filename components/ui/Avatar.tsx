type Tone = 'brand' | 'success'

interface AvatarProps {
  name?: string
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
}

const toneClasses: Record<Tone, string> = {
  brand: 'bg-indigo-100 text-indigo-600',
  success: 'bg-emerald-100 text-emerald-600',
}

const sizeClasses = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

export function Avatar({ name, tone = 'brand', size = 'md' }: AvatarProps) {
  return (
    <div
      className={`${sizeClasses[size]} ${toneClasses[tone]} rounded-full flex items-center justify-center font-bold flex-shrink-0`}
    >
      {name?.charAt(0).toUpperCase() || '?'}
    </div>
  )
}
