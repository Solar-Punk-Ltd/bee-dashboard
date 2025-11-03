// Tooltip content for File Manager
export const TOOLTIPS = {
  // Admin Stamp Creation
  ADMIN_DESIRED_LIFETIME: `Sets the initial funding period. This determines the Estimated Cost to deposit.
<br/><br/>
⚠️ Warning: This is your root identity. If it expires, you will lose access to your entire files.`,

  ADMIN_SECURITY_LEVEL: `Choose how resiliently your identity’s core information is protected across the network. A higher level makes extra backup copies and spreads them widely. This provides extra protection against data loss in the improbable event of substantial network outages.
<br/><br/>
⚖️ Trade-off: More backup copies result in increasing the Estimated Cost for the same Desired Lifetime. Choose the balance of safety and cost you're comfortable with.`,

  ADMIN_ESTIMATED_COST: `This is the total xBZZ tokens that will be deposited against the Private Key. This amount is used to pay network rent. The cost is calculated based on the processing and storage required for the Desired Lifetime at your chosen Security Level.`,

  ADMIN_PURCHASE_BUTTON: `Click to create your Private Key, that serves as your digital seal, allowing you to create and manage your drives.`,

  // Drive Creation
  DRIVE_NAME: `Set a human-readable label for this drive. This name is part of the metadata stored against your Private Key and helps you organize your drives.`,

  DRIVE_INITIAL_CAPACITY: `Select the total storage size you anticipate needing for this drive. You can generally count on having this amount of space available. You can increase the size later.
<br/><br/>
⚠️ Warning: Be aware that in rare cases the drive might indicate it's full sooner than expected. This happens because of how files are arranged internally.
<br/><br/>
💡 Recommendation: Choosing a size that gives you a bit more room than your absolute minimum need provides extra flexibility and helps avoid these uncommon scenarios.`,

  DRIVE_DESIRED_LIFETIME: `Select the initial funding period for this drive. This is not a fixed expiry date. It's the estimated time it will take for the drive's balance to be depleted. You can top up any time to extend the lifetime.
<br/><br/>
⚠️ Warning: If it runs out, the drive expires. Your data is no longer paid for and will be permanently deleted by the network. Please be advised that the expiry date, along with other pertinent factors, is contingent upon prevailing market conditions.`,

  DRIVE_SECURITY_LEVEL: `Select the desired level of data resilience for the files on this drive. Elevated levels generate additional backup copies (parity chunks) of your data, distributing them across the network to enhance security, mitigating risks even in the improbable event of substantial network outages.
<br/><br/>
⚖️ Trade-Off: You pay a network storage fee for every piece of data stored (original + backups). Higher security means more backup copies, increasing the initial cost.`,

  DRIVE_ESTIMATED_COST: `This cost is derived from a three-way multiplication among:
<br/>
• Capacity: How much you can store.
<br/>
• Security Level: How resilient your data is.
<br/>
• Lifetime: How long your data is paid for.
<br/><br/>
To increase one, it is necessary to either increase the cost or decrease one of the other factors.`,
}
