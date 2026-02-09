
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from matplotlib.backends.backend_pdf import PdfPages

# Load the CSV file
df = pd.read_csv(r'C:\Users\laure\Downloads\draft_simulation_results (4).csv')

# Prepare PDF
with PdfPages('draft_analysis_report.pdf') as pdf:
    # Average final score for each player by draft order
    avg_by_player = df.groupby(['draftOrder', 'player'])['totalScore'].mean().unstack()
    # Overall summary by draft order
    summary = df.groupby('draftOrder')['totalScore'].agg(['mean', 'std', 'min', 'max', 'count'])

    # Find the draft (sim) where the difference between p3 and (p1+p2) is maximized, and similar for other players
    combo_text = ''
    for order in df['draftOrder'].unique():
        sub = df[df['draftOrder'] == order]
        # Group by sim, pivot to get player columns
        pivot = sub.pivot(index='sim', columns='player', values='totalScore')
        # Only consider sims with all 3 or 4 players present
        for n_players in [3, 4]:
            if pivot.shape[1] < n_players:
                continue
            if n_players == 3:
                # For 3 players: p3 - (p1 + p2)
                pivot3 = pivot[[1,2,3]].dropna()
                pivot3['diff'] = pivot3[3] - (pivot3[1] + pivot3[2])
                max_row = pivot3['diff'].idxmax()
                max_val = pivot3.loc[max_row, 'diff']
                combo_text += f"\nDraft Order: {order} (3 players)\nSim #{max_row}: p3 - (p1+p2) = {max_val:.2f}\nScores: p1={pivot3.loc[max_row,1]:.2f}, p2={pivot3.loc[max_row,2]:.2f}, p3={pivot3.loc[max_row,3]:.2f}\n"
                # Show the full draft row for this sim
                sim_rows = sub[sub['sim'] == max_row].sort_values('player')
                combo_text += 'Draft details:\n' + sim_rows[['player','totalScore','leader','lore']].to_string(index=False) + '\n'
            if n_players == 4:
                # For 4 players: p4 - (p1 + p2 + p3), and so on
                pivot4 = pivot[[1,2,3,4]].dropna()
                # p4 - (p1+p2+p3)
                pivot4['diff4'] = pivot4[4] - (pivot4[1] + pivot4[2] + pivot4[3])
                max_row4 = pivot4['diff4'].idxmax()
                max_val4 = pivot4.loc[max_row4, 'diff4']
                combo_text += f"\nDraft Order: {order} (4 players)\nSim #{max_row4}: p4 - (p1+p2+p3) = {max_val4:.2f}\nScores: p1={pivot4.loc[max_row4,1]:.2f}, p2={pivot4.loc[max_row4,2]:.2f}, p3={pivot4.loc[max_row4,3]:.2f}, p4={pivot4.loc[max_row4,4]:.2f}\n"
                sim_rows4 = sub[sub['sim'] == max_row4].sort_values('player')
                combo_text += 'Draft details:\n' + sim_rows4[['player','totalScore','leader','lore']].to_string(index=False) + '\n'
                # p3 - (p1+p2)
                pivot4['diff3'] = pivot4[3] - (pivot4[1] + pivot4[2])
                max_row3 = pivot4['diff3'].idxmax()
                max_val3 = pivot4.loc[max_row3, 'diff3']
                combo_text += f"Sim #{max_row3}: p3 - (p1+p2) = {max_val3:.2f}\nScores: p1={pivot4.loc[max_row3,1]:.2f}, p2={pivot4.loc[max_row3,2]:.2f}, p3={pivot4.loc[max_row3,3]:.2f}, p4={pivot4.loc[max_row3,4]:.2f}\n"
                sim_rows3 = sub[sub['sim'] == max_row3].sort_values('player')
                combo_text += 'Draft details:\n' + sim_rows3[['player','totalScore','leader','lore']].to_string(index=False) + '\n'
                # p2 - p1
                pivot4['diff2'] = pivot4[2] - pivot4[1]
                max_row2 = pivot4['diff2'].idxmax()
                max_val2 = pivot4.loc[max_row2, 'diff2']
                combo_text += f"Sim #{max_row2}: p2 - p1 = {max_val2:.2f}\nScores: p1={pivot4.loc[max_row2,1]:.2f}, p2={pivot4.loc[max_row2,2]:.2f}, p3={pivot4.loc[max_row2,3]:.2f}, p4={pivot4.loc[max_row2,4]:.2f}\n"
                sim_rows2 = sub[sub['sim'] == max_row2].sort_values('player')
                combo_text += 'Draft details:\n' + sim_rows2[['player','totalScore','leader','lore']].to_string(index=False) + '\n'

    # Write summary and averages to a text page
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    text = 'Draft Simulation Analysis\n\n'
    text += 'Average Final Score for Each Player (by Draft Order):\n' + avg_by_player.round(2).to_string() + '\n\n'
    text += 'Summary by Draft Order (Final Score):\n' + summary.round(2).to_string() + '\n\n'
    text += 'Maximum Player-vs-Group Score Differences (by Draft Order):\n' + combo_text + '\n'

    # Outlier detection: top 3 biggest positive/negative deviations from mean (per draft order)
    outlier_text = ''
    for order in df['draftOrder'].unique():
        sub = df[df['draftOrder'] == order].copy()
        mean_score = sub['totalScore'].mean()
        sub['diff_from_mean'] = sub['totalScore'] - mean_score
        # Top 3 positive outliers
        top3 = sub.nlargest(3, 'diff_from_mean')
        # Top 3 negative outliers
        bot3 = sub.nsmallest(3, 'diff_from_mean')
        outlier_text += f'\nDraft Order: {order}\n'
        outlier_text += 'Top 3 Positive Outliers (Biggest Above Mean):\n'
        outlier_text += top3[['player','totalScore','diff_from_mean','leader','lore']].round(2).to_string(index=False) + '\n'
        outlier_text += 'Top 3 Negative Outliers (Biggest Below Mean):\n'
        outlier_text += bot3[['player','totalScore','diff_from_mean','leader','lore']].round(2).to_string(index=False) + '\n'
    text += outlier_text
    ax.text(0, 1, text, fontsize=10, va='top', family='monospace')
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)

    # Boxplot of totalScore by draftOrder
    plt.figure(figsize=(8, 6))
    sns.boxplot(x='draftOrder', y='totalScore', data=df)
    plt.title('Final Score by Draft Order')
    pdf.savefig()
    plt.close()

    # Boxplot of totalScore by player and draftOrder
    plt.figure(figsize=(10, 6))
    sns.boxplot(x='player', y='totalScore', hue='draftOrder', data=df)
    plt.title('Final Score by Player and Draft Order')
    pdf.savefig()
    plt.close()

    # Distribution of totalScore by draftOrder
    plt.figure(figsize=(8, 6))
    sns.histplot(df, x='totalScore', hue='draftOrder', element='step', stat='density', common_norm=False)
    plt.title('Distribution of Final Score by Draft Order')
    pdf.savefig()
    plt.close()

print('PDF report generated as draft_analysis_report.pdf')
