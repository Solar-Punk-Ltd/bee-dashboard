#!/bin/bash

# Configuration
COMMAND="swarm-cli stamp buy --depth 18 --amount 2500m --immutable false --yes --bee-api-url http://localhost:1633"
ITERATIONS=10
LOGFILE="swarm-cli-logs.txt"

# Check if 'bc' is installed, as it's required for float math
if ! command -v bc &> /dev/null; then
    echo "Error: 'bc' (basic calculator) is required for time calculation but not found."
    echo "Please install it (e.g., 'sudo apt install bc' on Debian/Ubuntu or 'brew install bc' on macOS)."
    exit 1
fi

# Clear previous log file for a fresh run
> "$LOGFILE"

echo "--- Starting $ITERATIONS runs, logging duration in seconds ---"
echo "Command: $COMMAND"
echo "Log file: $LOGFILE"
echo "-------------------------------------------------------------"

# Loop through the specified number of iterations
for i in $(seq 1 $ITERATIONS); do
    
    # 1. Capture Start Time (seconds.nanoseconds)
    START_TIME=$(date +%s.%N) 
    START_DATE=$(date +"%Y-%m-%d %H:%M:%S")

    START_MSG="[$i/$ITERATIONS] START: $START_DATE"
    echo "$START_MSG" | tee -a "$LOGFILE"
    
    # 2. Execute Command
    # Command output (stdout and stderr) is redirected to the log file.
    if $COMMAND >> "$LOGFILE" 2>&1; then
        
        # 3. Capture End Time
        END_TIME=$(date +%s.%N) 
        
        # 4. Calculate Elapsed Time in Seconds
        # 'bc' is used for the subtraction of floating-point numbers.
        ELAPSED_SECONDS=$(echo "scale=6; $END_TIME - $START_TIME" | bc)
        
        # 5. Log Results
        SUCCESS_MSG="[$i/$ITERATIONS] SUCCESS: Finished successfully."
        ELAPSED_MSG="[$i/$ITERATIONS] DURATION: **$ELAPSED_SECONDS seconds**"
        
        echo "$SUCCESS_MSG" | tee -a "$LOGFILE"
        echo "$ELAPSED_MSG" | tee -a "$LOGFILE"
        echo "---" | tee -a "$LOGFILE"

    else
        # 6. Log Failure
        ERROR_MSG="[$i/$ITERATIONS] ** FAILED **: Command returned an error."
        echo "$ERROR_MSG" | tee -a "$LOGFILE"
        echo "Check the log file for the command's output and error details." | tee -a "$LOGFILE"
        echo "---" | tee -a "$LOGFILE"
    fi
    
done

echo "--- Script finished. Review $LOGFILE for detailed logs and timings. ---"
