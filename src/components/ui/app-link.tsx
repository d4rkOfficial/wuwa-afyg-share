'use client'

import Link, { useLinkStatus } from 'next/link'

type LinkProps = React.ComponentProps<typeof Link>

function PendingHint() {
    const { pending } = useLinkStatus()

    return <span className={`app-link-hint ${pending ? 'is-pending' : ''}`} aria-hidden="true" />
}

export default function AppLink({ children, className, ...props }: LinkProps) {
    return (
        <Link {...props} className={`app-link ${className ?? ''}`}>
            {children}
            <PendingHint />
        </Link>
    )
}
