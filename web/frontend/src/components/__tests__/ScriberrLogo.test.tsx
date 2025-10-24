import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScriberrLogo } from '../ScriberrLogo'

describe('ScriberrLogo', () => {
  it('renders the brand image with accessible alt text', () => {
    render(<ScriberrLogo />)
    expect(screen.getByRole('img', { name: /scriberr/i })).toBeInTheDocument()
  })

  it('handles keyboard activation when clickable', async () => {
    const onClick = vi.fn()
    render(<ScriberrLogo onClick={onClick} />)
    const button = screen.getByRole('button', { name: /scriberr/i })

    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalled()
  })
})
