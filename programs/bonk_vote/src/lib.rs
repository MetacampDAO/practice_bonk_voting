use anchor_spl::token::{TokenAccount, Transfer, Token, Mint,approve, transfer, Burn, burn, Approve};

use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const DEVELOPER_PUBKEY: &str = "xxxx";
const BONK_MINT: &str = "xxxx";

#[program]
pub mod bonk_vote {
    use super::*;

    pub fn initialize_global_state(ctx: Context<InitializeGlobalState>, bonk_per_vote: u32, percentage_burn: u8, percentage_developer: u8) -> Result<()> {
        
        require!(percentage_burn + percentage_developer == 100, ErrorCode::ImbalancedDistribution);

        // CREATE NEW PAIR
        ctx.accounts.global_state.developer_bonk = ctx.accounts.developer_bonk.key();
        ctx.accounts.global_state.bonk_per_vote = bonk_per_vote;
        ctx.accounts.global_state.percentage_burn = percentage_burn;
        ctx.accounts.global_state.percentage_developer = percentage_developer;

        Ok(())
    }

    pub fn initialize_pair(ctx: Context<InitializePair>, a_name: String, a_link: String, b_name: String, b_link: String) -> Result<()> {
        // CREATE NEW PAIR
        ctx.accounts.pair.a_name = a_name;
        ctx.accounts.pair.a_link = a_link;
        ctx.accounts.pair.a_vote = 0;
        ctx.accounts.pair.b_name = b_name;
        ctx.accounts.pair.b_link = b_link;
        ctx.accounts.pair.b_vote = 0;

        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, _a_name: String, _b_name: String, vote_a: bool) -> Result<()> {
        // VOTE
        if vote_a {
            // VOTE A
            ctx.accounts.pair.a_vote += 1;
        } else {
            // VOTE B
            ctx.accounts.pair.b_vote += 1;
        }
        
        // TRANSFER BONK TO DEVELOPER WALLET
        let cpi_transfer_accounts = Transfer {
            from: ctx.accounts.voter_bonk.to_account_info().clone(),
            to: ctx.accounts.developer_bonk.to_account_info().clone(),
            authority: ctx.accounts.voter.to_account_info().clone(),
        };
        
        let amount_to_developer: u32 = ctx.accounts.global_state.bonk_per_vote / 100 * ctx.accounts.global_state.percentage_developer as u32;
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info().clone(), 
                cpi_transfer_accounts,
            ),
            amount_to_developer.into()
        )?;

        // APPROVE DELEGATE
        let amount_to_burn: u32 = ctx.accounts.global_state.bonk_per_vote / 100 * ctx.accounts.global_state.percentage_burn as u32;

        let cpi_delegate_accounts = Approve {
            to: ctx.accounts.voter_bonk.to_account_info(),
            delegate: ctx.accounts.voter.to_account_info(),
            authority: ctx.accounts.voter.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        // Create the CpiContext we need for the request
        let cpi_ctx = CpiContext::new(cpi_program, cpi_delegate_accounts);

        // Execute anchor's helper function to approve tokens
        approve(cpi_ctx, amount_to_burn.into())?;
        
        // BURN BONK
        let cpi_burn_accounts = Burn {
            mint: ctx.accounts.mint_address.to_account_info(),
            from: ctx.accounts.voter_bonk.to_account_info(),
            authority: ctx.accounts.voter.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_burn_accounts
        );

        burn(cpi_ctx, amount_to_burn.into())?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGlobalState<'info> {
    #[account(
        init,
        seeds = [b"global"],
        bump,
        payer = developer,
        space = GlobalState::LEN())]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        mut,
        token::authority = developer.key(),
        token::mint = mint_address,
    )]
    pub developer_bonk: Account<'info, TokenAccount>,
    #[account(
        mut,
        // constraint = developer.key() == Pubkey::from_str(DEVELOPER_PUBKEY).unwrap()
    )]
    pub developer: Signer<'info>,
    // #[account(
    //     constraint = mint_address.key() == Pubkey::from_str(BONK_MINT).unwrap()
    // )]
    pub mint_address: Account<'info, Mint>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(a_name: String, a_link: String, b_name: String, b_link: String)]
pub struct InitializePair<'info> {
    #[account(
        init,
        seeds = [b"pair", a_name.as_bytes().as_ref(), b_name.as_bytes().as_ref()],
        bump,
        payer = developer,
        space = Pair::LEN(&a_name, &a_link, &b_name, &b_link))]
    pub pair: Account<'info, Pair>,
    #[account(
        mut,
        // constraint = developer.key() == Pubkey::from_str(DEVELOPER_PUBKEY).unwrap()
    )]
    pub developer: Signer<'info>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(a_name: String, b_name: String)]
pub struct Vote<'info> {
    #[account(seeds = [b"global"], bump)]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        mut,
        seeds = [b"pair", a_name.as_bytes().as_ref(), b_name.as_bytes().as_ref()],
        bump,
        )]
    pub pair: Account<'info, Pair>,
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(
        mut,
        token::authority = voter.key(),
        token::mint = mint_address,
    )]
    pub voter_bonk: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint_address,
        constraint = global_state.developer_bonk.key() == developer_bonk.key()
    )]
    pub developer_bonk: Account<'info, TokenAccount>,
    // #[account(
        //     constraint = mint_address.key() == Pubkey::from_str(BONK_MINT).unwrap()
        // )]
    #[account(mut)]
    pub mint_address: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>
}

#[account]
pub struct GlobalState {
    developer_bonk: Pubkey,
    bonk_per_vote: u32,
    percentage_burn: u8,
    percentage_developer: u8
}

#[account]
pub struct Pair {
    a_name: String,
    a_link: String,
    a_vote: u16,
    b_name: String,
    b_link: String,
    b_vote: u16,
}

const DISCRIMINATOR: usize = 8;
const PREFIX: usize = 4;
const PUBKEY: usize = 32;
const U8: usize = 1;
const U16: usize = 2;
const U32: usize = 4;

impl GlobalState {
    fn LEN() -> usize {
        DISCRIMINATOR + PUBKEY + U32 + U8 + U8
    }
}
impl Pair {
    fn LEN(a_name: &str, b_name: &str, a_link: &str, b_link: &str) -> usize {
        DISCRIMINATOR + 
        PREFIX + a_name.len() + 
        PREFIX + a_link.len() + 
        U16 +
        PREFIX + b_name.len() + 
        PREFIX + b_link.len() + 
        U16
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Total distribution must be 100")]
    ImbalancedDistribution
}